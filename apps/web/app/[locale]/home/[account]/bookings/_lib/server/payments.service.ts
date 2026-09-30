import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { getLogger } from '@kit/shared/logger';

import type { Database } from '~/lib/database.types';
import {
  type SiteBooking,
  getBooking,
  listSitePayments,
  setPaymentStatus,
} from '~/lib/villa-db/bookings';
import { type VillaSite, getVillaSite } from '~/lib/villa-db/client';
import { VillaDbError } from '~/lib/villa-db/errors';
import { sitePaymentStatus, summariseLedger } from '~/lib/villa/ledger';
import { mirrorBooking } from '~/lib/villa/mirror';

import type {
  RecordPaymentSchema,
  RecordRefundSchema,
  VoidPaymentSchema,
} from '../schemas/payments.schema';

type Client = SupabaseClient<Database>;

/** A refusal written for the user. */
export class PaymentError extends Error {}

/** Postgres errors from the money functions, as the user should read them. */
function fromDbError(error: { code?: string; message: string }): Error {
  if (error.code === '42501') {
    return new PaymentError(
      error.message.startsWith('Only') || error.message.startsWith('You')
        ? error.message
        : "You don't have permission to do this.",
    );
  }

  // Raised by the functions with a message meant for the user.
  if (error.code === '22023') return new PaymentError(error.message);

  if (error.code === '23514') {
    return new PaymentError('Check the amount and the details.');
  }

  return new PaymentError('Could not save. Please try again.');
}

/** The booking's full money picture, for the booking page. */
export async function loadLedger(
  client: Client,
  site: VillaSite,
  booking: SiteBooking,
) {
  const [online, payments, refunds] = await Promise.all([
    listSitePayments(site, booking.id),
    client
      .from('villa_booking_payments')
      .select(
        'id, receipt_no, mode, amount, paid_on, reference, payer_name, note, recorded_at, voided_at, void_reason',
      )
      .eq('property_id', site.propertyId)
      .eq('site_booking_id', booking.id)
      .order('recorded_at'),
    client
      .from('villa_refunds')
      .select(
        'id, payment_id, refund_no, amount, mode, refunded_on, reference, reason, status',
      )
      .eq('property_id', site.propertyId)
      .eq('site_booking_id', booking.id)
      .order('recorded_at'),
  ]);

  const error = payments.error ?? refunds.error;

  if (error) {
    (await getLogger()).error(
      { bookingId: booking.id, code: error.code },
      'villa ledger load failed',
    );
    throw new Error('Could not load the payments. Refresh to try again.');
  }

  const summary = summariseLedger({
    totalPaise: booking.totalAmountPaise,
    bookingStatus: booking.status,
    online: online.map((p) => ({
      amountPaise: p.amountPaise,
      status: p.status,
    })),
    offline: (payments.data ?? []).map((p) => ({
      amount: Number(p.amount),
      voided: Boolean(p.voided_at),
    })),
    refunds: (refunds.data ?? []).map((r) => ({
      amount: Number(r.amount),
      status: r.status,
    })),
  });

  return {
    summary,
    online,
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
  };
}

/**
 * Offline payments, voids and refunds for a booking. The money itself is
 * written by the database functions (record_villa_payment and friends), under
 * the member's own session so their role is what is checked; this service
 * checks the booking on the booking site first, and afterwards keeps the
 * site's payment status in step.
 */
export function createPaymentsService(client: Client) {
  async function bookingFor(
    accountId: string,
    propertyId: string,
    bookingId: string,
    allowed: readonly string[],
  ) {
    const site = await getVillaSite(accountId, propertyId);
    const booking = await getBooking(site, bookingId);

    if (!booking) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

    if (!allowed.includes(booking.status)) {
      throw new PaymentError(
        booking.status === 'cancelled'
          ? 'This booking is cancelled. Only refunds can be recorded.'
          : 'Payments can be recorded only for a confirmed stay.',
      );
    }

    return { site, booking };
  }

  /** The receipt must be this booking's, checked before any change. */
  async function assertOnBooking(
    propertyId: string,
    bookingId: string,
    paymentId: string,
  ) {
    const { data, error } = await client
      .from('villa_booking_payments')
      .select('id')
      .eq('id', paymentId)
      .eq('property_id', propertyId)
      .eq('site_booking_id', bookingId)
      .maybeSingle();

    if (error) throw fromDbError(error);
    if (!data) throw new PaymentError('That receipt is not on this booking.');
  }

  /**
   * Brings the guest site's payment status in line with the ledger, from a
   * fresh read of the booking. Never downgrades a booking the site itself
   * marked paid: only the move INTO 'paid' is held back (sitePaymentStatus).
   * Best-effort; the next change re-derives it.
   */
  async function syncStatus(site: VillaSite, bookingId: string, actor: string) {
    try {
      const booking = await getBooking(site, bookingId);
      if (!booking) return;

      const { summary } = await loadLedger(client, site, booking);

      if (summary.status === 'paid' && booking.paymentStatus === 'paid') return;

      let next = sitePaymentStatus(summary.status);

      // 'refunded' is for cancelled stays only (contract §7).
      if (next === 'refunded' && booking.status !== 'cancelled')
        next = 'unpaid';

      if (next === booking.paymentStatus) return;

      const updated = await setPaymentStatus(site, booking.id, next, actor);
      await mirrorBooking(site, updated);
    } catch (error) {
      (await getLogger()).warn(
        { bookingId, error: String(error) },
        'villa payment status write-back failed',
      );
    }
  }

  return {
    async record(input: z.output<typeof RecordPaymentSchema>, actor: string) {
      const { site, booking } = await bookingFor(
        input.accountId,
        input.propertyId,
        input.bookingId,
        ['confirmed', 'completed'],
      );

      // The database checks the booking against Ooruda's copy: refresh it
      // from the site first (a website booking may not be copied yet).
      await mirrorBooking(site, booking);

      const { data, error } = await client.rpc('record_villa_payment', {
        p_property_id: input.propertyId,
        p_site_booking_id: booking.id,
        p_request_id: input.requestId,
        p_mode: input.mode,
        p_amount: input.amount,
        p_paid_on: input.paidOn,
        p_reference: input.reference,
        p_payer_name: input.payerName,
        p_note: input.note,
      });

      if (error) throw fromDbError(error);

      await syncStatus(site, booking.id, actor);

      return { receiptNo: data.receipt_no };
    },

    async void(input: z.output<typeof VoidPaymentSchema>, actor: string) {
      const { site, booking } = await bookingFor(
        input.accountId,
        input.propertyId,
        input.bookingId,
        ['confirmed', 'completed', 'cancelled'],
      );

      await assertOnBooking(input.propertyId, booking.id, input.paymentId);

      const { error } = await client.rpc('void_villa_payment', {
        p_payment_id: input.paymentId,
        p_reason: input.reason,
      });

      if (error) throw fromDbError(error);

      await syncStatus(site, booking.id, actor);
    },

    async refund(input: z.output<typeof RecordRefundSchema>, actor: string) {
      const { site, booking } = await bookingFor(
        input.accountId,
        input.propertyId,
        input.bookingId,
        ['confirmed', 'completed', 'cancelled'],
      );

      await assertOnBooking(input.propertyId, booking.id, input.paymentId);

      const { data, error } = await client.rpc('record_villa_refund', {
        p_payment_id: input.paymentId,
        p_amount: input.amount,
        p_mode: input.mode,
        p_refunded_on: input.refundedOn,
        p_reference: input.reference,
        p_reason: input.reason,
        p_request_id: input.requestId,
      });

      if (error) throw fromDbError(error);

      await syncStatus(site, booking.id, actor);

      return { refundNo: data.refund_no };
    },
  };
}
