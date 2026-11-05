import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { getLogger } from '@kit/shared/logger';
import { normalizePhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { Database } from '~/lib/database.types';
import { formatDateReadable } from '~/lib/format-date';
import type { VillaRole } from '~/lib/roles';
import { checkAvailability } from '~/lib/villa-db/availability';
import { getChannelBlock, listBlocks } from '~/lib/villa-db/blocks';
import {
  type SiteBooking,
  cancelBooking,
  cancelBookingForVoid,
  channelValueForFeed,
  clearChannelLink,
  createOfflineBooking,
  getBooking,
  getChannelLinkedBooking,
  markStayCompleted,
  reopenStay,
  setPaymentStatus,
  updateBookingMoney,
  toSitePhone,
  updateBookingGuestDetails,
} from '~/lib/villa-db/bookings';
import { type VillaSite, getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { VillaDbError, isVillaDbError } from '~/lib/villa-db/errors';
import { getPricingInputs } from '~/lib/villa-db/rates';
import { recordBookingActivity } from '~/lib/villa/activity';
import {
  type BookingMoney,
  adjustmentsAvailable,
  basisIsReproducible,
  checkAdjustment,
  describeMoneyChange,
  recomputeMoney,
} from '~/lib/villa/booking-adjust';
import {
  type BookingGuestDetails,
  buildEditNote,
  checkGuestChange,
  describeBookingChanges,
} from '~/lib/villa/booking-edit';
import { blockNoteForDisplay } from '~/lib/villa/calendar';
import { parseChannelNote } from '~/lib/villa/channel-note';
import {
  type BookingActivityAction,
  EDITABLE_BOOKING_STATUSES,
} from '~/lib/villa/constants';
import {
  type VoidOutcome,
  buildVoidNote,
  checkVoidable,
  commissionNoteFor,
  commissionNoteFragment,
  commissionNoteMatches,
} from '~/lib/villa/enrichment-void';
import { purgeExpiredGuestIds } from '~/lib/villa/guest-id-retention';
import { sitePaymentStatus } from '~/lib/villa/ledger';
import { mirrorBooking } from '~/lib/villa/mirror';
import { fromPaise, fromPaiseToString } from '~/lib/villa/money';
import { type QuoteError, quoteStay } from '~/lib/villa/pricing';

import type {
  CancelBookingSchema,
  CheckInStaySchema,
  CompleteStaySchema,
  EnrichChannelStaySchema,
  NewBookingSchema,
  ReopenStaySchema,
  AdjustBookingMoneySchema,
  StaySchema,
  UpdateBookingSchema,
  VoidEnrichmentSchema,
} from '../schemas/bookings.schema';
import { SALUTATIONS } from '../schemas/bookings.schema';
import { loadLedger } from './payments.service';

import { createHash } from 'node:crypto';

type Client = SupabaseClient<Database>;

/** A quote as the booking form shows it (rupees). */
export type QuoteView =
  | {
      ok: true;
      available: true;
      nights: number;
      base: number;
      extraGuests: number;
      extraGuestAmount: number;
      tax: number;
      taxLines: { rate: number; taxable: number; tax: number }[];
      total: number;
      /** Sent back on confirm so the server can detect a price change. */
      totalPaise: number;
      /**
       * Priced under the admin's cutoff override: the public site would refuse
       * this check-in. The form asks for a confirmation before saving.
       */
      pastCutoff: boolean;
      nightly: {
        date: string;
        rate: number;
        weekend: boolean;
        rule: string | null;
      }[];
    }
  | { ok: false; reason: 'DATE_UNAVAILABLE' | 'DATE_BLOCKED'; message: string }
  | { ok: false; reason: QuoteError['code']; message: string };

const TAKEN: Record<'DATE_UNAVAILABLE' | 'DATE_BLOCKED', string> = {
  DATE_UNAVAILABLE: 'Some of those nights are already booked.',
  DATE_BLOCKED: 'Some of those nights are blocked.',
};

/**
 * The request id for a channel payout receipt.
 *
 * Derived from the booking so the same payout recorded twice — a retry after
 * a timeout, say — is recognised by `record_villa_payment`'s idempotency key
 * instead of being counted as a second payment. A random id would make every
 * retry a new receipt.
 */
/**
 * Escapes a value interpolated into a Postgres LIKE/ILIKE pattern, so a
 * booking reference containing `%` or `_` matches literally instead of as a
 * wildcard.
 */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function channelPayoutRequestId(bookingId: string): string {
  const hash = createHash('sha1')
    .update(`villa:channel-payout:${bookingId}`)
    .digest('hex');

  // Shaped as a v5-style UUID: the column is a uuid.
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

/**
 * Bookings for a villa property. Callers authorise first; every site call is
 * scoped to the property by lib/villa-db. Amounts are always priced here on
 * the server — never taken from the browser.
 */
export function createBookingsService(client: Client) {
  /** Load the booking cutoff date for a villa account (null = no limit). */
  async function getBookingCutoffDate(
    accountId: string,
  ): Promise<string | null> {
    const { data } = await client
      .from('villa_account_settings')
      .select('booking_cutoff_date')
      .eq('account_id', accountId)
      .maybeSingle();

    return data?.booking_cutoff_date ?? null;
  }

  async function priceStay(
    input: z.output<typeof StaySchema>,
    options?: { ignoreCutoff?: boolean },
    existingSite?: VillaSite,
  ) {
    const site =
      existingSite ?? (await getVillaSite(input.accountId, input.propertyId));
    const [availability, pricing] = await Promise.all([
      checkAvailability(site, input.checkIn, input.checkOut, options),
      getPricingInputs(site),
    ]);

    return {
      site,
      availability,
      result: quoteStay({
        ...pricing,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        adults: input.adults,
        children: input.children,
      }),
    };
  }

  /**
   * Re-derives `payment_status` from the receipt ledger and writes it back to
   * the site, returning the updated booking (or null when nothing changed or
   * it could not be done).
   *
   * Best-effort by design, matching the payments service: the business action
   * has already happened and a failed status write-back must not undo it. The
   * caller mirrors whichever booking it gets back.
   */
  async function resyncPaymentStatus(
    site: VillaSite,
    booking: SiteBooking,
    actor: string,
  ): Promise<SiteBooking | null> {
    try {
      const { summary } = await loadLedger(client, site, booking);

      let next = sitePaymentStatus(summary.status);

      // 'refunded' is for cancelled stays only (contract §7).
      if (next === 'refunded' && booking.status !== 'cancelled')
        next = 'unpaid';

      if (next === booking.paymentStatus) return null;

      return await setPaymentStatus(site, booking.id, next, actor);
    } catch (error) {
      (await getLogger()).warn(
        { bookingId: booking.id, error: String(error) },
        'villa void enrichment: payment status write-back failed',
      );

      return null;
    }
  }

  /** The edited fields as held on the site, for the activity-log diff. */
  function toGuestDetails(b: SiteBooking): BookingGuestDetails {
    return {
      salutation: b.salutation ?? '',
      guestName: b.guestName ?? '',
      firstName: b.firstName ?? '',
      lastName: b.lastName ?? '',
      phone: toSitePhone(b.guestPhone),
      email: b.guestEmail ?? '',
      adults: b.adults,
      children: b.children,
      infants: b.infants,
      specialRequests: b.specialRequests ?? '',
    };
  }

  async function record(
    entry: {
      accountId: string;
      propertyId: string;
      booking: Pick<SiteBooking, 'id' | 'bookingCode'>;
      action: BookingActivityAction;
      reasonCode?: string | null;
      note?: string | null;
    },
    actor: string,
  ) {
    await recordBookingActivity(entry, actor);
  }

  /**
   * A cancelled stay has no reason to keep guest ID photos: bring their
   * deletion forward to today and purge now. Best-effort; the next purge run
   * picks up anything missed.
   */
  async function releaseGuestIds(
    accountId: string,
    propertyId: string,
    bookingId: string,
  ) {
    const admin = getSupabaseServerAdminClient();
    const today = todayIst();

    // Update purge_after on the document rows (kept for query convenience).
    const { error, data: docs } = await admin
      .from('villa_guest_documents')
      .update({ purge_after: today })
      .eq('account_id', accountId)
      .eq('property_id', propertyId)
      .eq('site_booking_id', bookingId)
      .is('purged_at', null)
      .select('id');

    if (error) {
      (await getLogger()).error(
        { bookingId, code: error.code },
        'villa cancel: guest id purge date update failed',
      );
      return;
    }

    // Also bring forward the files table so the purge job can find them.
    if ((docs ?? []).length > 0) {
      await admin
        .from('villa_guest_document_files')
        .update({ purge_after: today })
        .in(
          'document_id',
          (docs ?? []).map((d) => d.id),
        )
        .is('purged_at', null);
    }

    await purgeExpiredGuestIds(accountId).catch(async (e: unknown) =>
      (await getLogger()).error(
        { bookingId, error: String(e) },
        'villa cancel: guest id purge failed',
      ),
    );
  }

  /**
   * How the booking cutoff applies to this request.
   *
   * The cutoff closes PUBLIC sales. An admin may still record a stay past it,
   * but only deliberately: `overrideCutoff` is set by a confirmation step in
   * the form, and only villa_admin is allowed to set it. A manager, and an
   * admin who has not confirmed, are refused with the reason.
   */
  async function cutoffDecision(
    input: { accountId: string; checkIn: string; overrideCutoff: boolean },
    role: VillaRole,
  ): Promise<
    | { kind: 'within' }
    | { kind: 'override'; cutoff: string }
    | { kind: 'refused'; cutoff: string; message: string }
  > {
    const cutoff = await getBookingCutoffDate(input.accountId);

    if (!cutoff || input.checkIn <= cutoff) return { kind: 'within' };

    if (input.overrideCutoff && role === 'villa_admin') {
      return { kind: 'override', cutoff };
    }

    const readable = formatDateReadable(cutoff);

    return {
      kind: 'refused',
      cutoff,
      message:
        role === 'villa_admin'
          ? `Bookings are closed after ${readable}. Confirm the override to record this stay anyway.`
          : `Bookings are closed after ${readable}. Only a villa admin can record a stay past that date.`,
    };
  }

  return {
    getBookingCutoffDate,

    async quote(
      input: z.output<typeof StaySchema>,
      role: VillaRole,
    ): Promise<QuoteView> {
      const [cutoff, site] = await Promise.all([
        cutoffDecision(input, role),
        getVillaSite(input.accountId, input.propertyId),
      ]);

      if (cutoff.kind === 'refused') {
        return {
          ok: false,
          reason: 'DATE_BLOCKED',
          message: cutoff.message,
        };
      }

      const { availability, result } = await priceStay(
        input,
        { ignoreCutoff: cutoff.kind === 'override' },
        site,
      );

      if (availability !== 'AVAILABLE') {
        return {
          ok: false,
          reason: availability,
          message: TAKEN[availability],
        };
      }

      if (!result.ok) {
        return {
          ok: false,
          reason: result.error.code,
          message: result.error.message,
        };
      }

      const q = result.quote;

      return {
        ok: true,
        available: true,
        nights: q.numNights,
        base: fromPaise(q.basePaise),
        extraGuests: q.extraGuests,
        extraGuestAmount: fromPaise(q.extraGuestPaise),
        tax: fromPaise(q.taxPaise),
        taxLines: q.gst.lines.map((l) => ({
          rate: l.rate,
          taxable: fromPaise(l.taxablePaise),
          tax: fromPaise(l.taxPaise),
        })),
        total: fromPaise(q.totalPaise),
        totalPaise: q.totalPaise,
        pastCutoff: cutoff.kind === 'override',
        nightly: q.nights.map((n) => ({
          date: n.date,
          rate: fromPaise(n.ratePaise),
          weekend: n.isWeekend,
          rule: n.rule ?? null,
        })),
      };
    },

    async create(
      input: z.output<typeof NewBookingSchema>,
      actor: string,
      role: VillaRole,
    ) {
      const [cutoff, site] = await Promise.all([
        cutoffDecision(input, role),
        getVillaSite(input.accountId, input.propertyId),
      ]);

      if (cutoff.kind === 'refused') {
        throw new VillaDbError(
          'DATE_BLOCKED',
          `check-in ${input.checkIn} is beyond cutoff ${cutoff.cutoff}`,
          cutoff.message,
        );
      }

      const { availability, result } = await priceStay(
        input,
        { ignoreCutoff: cutoff.kind === 'override' },
        site,
      );

      if (availability !== 'AVAILABLE') {
        throw new VillaDbError(
          availability,
          `${input.checkIn} → ${input.checkOut}`,
        );
      }

      let basePaise: number;
      let extraGuestPaise: number;
      let taxPaise: number;
      let totalPaise: number;

      if (input.isSpecialPrice && input.specialBaseAmount) {
        basePaise = Math.round(input.specialBaseAmount * 100);
        extraGuestPaise = 0;
        taxPaise = Math.round((input.specialGstAmount ?? 0) * 100);
        totalPaise = basePaise + taxPaise;

        if (totalPaise !== input.expectedTotalPaise) {
          throw new VillaDbError(
            'CONFLICT',
            `special total ${input.expectedTotalPaise}, calculated ${totalPaise}`,
            'The preferential price total does not match. Check the numbers and confirm again.',
          );
        }
      } else {
        if (!result.ok) {
          throw new VillaDbError(
            'INVALID_INPUT',
            result.error.code,
            result.error.message,
          );
        }

        const q = result.quote;

        // The price is always computed here; the quote the user saw is only
        // compared, never trusted. If rates changed in between, say so rather
        // than silently booking a different total than the guest was told.
        if (q.totalPaise !== input.expectedTotalPaise) {
          throw new VillaDbError(
            'CONFLICT',
            `quoted ${input.expectedTotalPaise}, now ${q.totalPaise}`,
            'The price changed since the quote. Check the new total and confirm again.',
          );
        }

        basePaise = q.basePaise;
        extraGuestPaise = q.extraGuestPaise;
        taxPaise = q.taxPaise;
        totalPaise = q.totalPaise;
      }

      const guestFullName = [input.firstName, input.lastName]
        .filter(Boolean)
        .join(' ');

      // create_booking_atomic re-checks availability under the site's lock,
      // so a clash since the quote is still refused here.
      const booking = await createOfflineBooking(
        site,
        {
          guestName: guestFullName,
          salutation: input.salutation,
          firstName: input.firstName,
          lastName: input.lastName || null,
          guestEmail: input.guestEmail,
          guestPhone: normalizePhoneNumber(input.guestPhone),
          adults: input.adults,
          children: input.children,
          infants: input.infants,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          baseAmount: fromPaiseToString(basePaise),
          extraGuestAmount: fromPaiseToString(extraGuestPaise),
          taxAmount: fromPaiseToString(taxPaise),
          totalAmount: fromPaiseToString(totalPaise),
          specialRequests: input.specialRequests,
          channel: input.channel,
          paymentStatus: input.paymentStatus,
          ignoreCutoff: cutoff.kind === 'override',
        },
        actor,
      );

      // The override is recorded on the booking's own trail: a stay the public
      // site would have refused should say who decided to take it.
      const notes = [
        input.isEvent ? 'Event booking' : null,
        input.isSpecialPrice && input.specialBaseAmount
          ? `Preferential price applied: ₹${input.specialBaseAmount.toLocaleString('en-IN')} + ₹${(input.specialGstAmount ?? 0).toLocaleString('en-IN')} GST`
          : null,
        cutoff.kind === 'override'
          ? `Recorded past the booking cutoff (${formatDateReadable(cutoff.cutoff)}) by an admin`
          : null,
      ].filter(Boolean);

      await Promise.all([
        record(
          {
            accountId: input.accountId,
            propertyId: input.propertyId,
            booking,
            action: 'created',
            note: notes.length > 0 ? notes.join('. ') : null,
          },
          actor,
        ),
        mirrorBooking(site, booking, input.isEvent ? 'event' : 'stay'),
      ]);

      // The advance taken when the booking was agreed becomes a receipt, so
      // the ledger — and the confirmation email that reads it — states a real
      // figure instead of "an advance was received". Written before the email
      // is queued below. A receipt that fails must not undo a booking the
      // guest has been promised, so it is logged for staff to add by hand.
      if (
        (input.paymentStatus === 'partially_paid' ||
          input.paymentStatus === 'paid') &&
        input.amountReceived > 0
      ) {
        if (input.amountReceived > fromPaise(totalPaise)) {
          throw new VillaDbError(
            'INVALID_INPUT',
            `advance ${input.amountReceived} over total ${totalPaise}`,
            'The amount received is more than the booking total.',
          );
        }

        const { error } = await client.rpc('record_villa_payment', {
          p_property_id: input.propertyId,
          p_site_booking_id: booking.id,
          p_request_id: crypto.randomUUID(),
          p_mode: input.paymentMode,
          p_amount: input.amountReceived,
          p_paid_on: todayIst(),
          p_reference: input.paymentReference,
          p_payer_name: guestFullName,
          p_note: 'Advance taken when the booking was made',
        });

        if (error) {
          (await getLogger()).error(
            { bookingId: booking.id, code: error.code },
            'villa booking advance receipt failed',
          );
        }
      }

      // Note: Automatic email sending on creation is removed as requested.
      // Confirmation emails can be sent explicitly from the booking details screen when needed.

      return booking;
    },

    /**
     * Attaches guest and money details to a stay a booking channel sold.
     *
     * The channel's block keeps holding the nights — the feed owns it and
     * replaces it on every sync — and this records the booking that fulfils
     * it, linked by (feed, UID). From then on the stay counts in revenue,
     * occupancy and Reports like any other booking.
     *
     * What it deliberately does NOT do:
     *   - price the stay. The rate card never sold these nights; the channel's
     *     payout is the only true figure, so the operator supplies it.
     *   - email the guest. Airbnb gives us no address and owns the guest
     *     conversation; a confirmation from us would be the second one they
     *     received for the same stay, from a sender they do not know.
     *   - ask about the booking cutoff. The cutoff closes OUR sales; this
     *     stay is already sold.
     */
    async enrichChannelStay(
      input: z.output<typeof EnrichChannelStaySchema>,
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const link = { feedId: input.feedId, externalUid: input.externalUid };

      // Read by the key, not by the row id the browser last saw: a sync
      // between render and submit replaces every row (villa-booking 00104),
      // and an id lookup would call a stay that is sitting in the calendar
      // gone. The feed id is checked against this property by the read
      // itself, and again by create_booking_atomic.
      const block = await getChannelBlock(site, link);

      if (!block) {
        throw new VillaDbError(
          'CHANNEL_EVENT_GONE',
          `no block for feed ${link.feedId} uid ${link.externalUid}`,
        );
      }

      // The dates are the feed's, never the browser's: a stale dialog must
      // not create a booking over nights the channel has since released.
      if (
        input.checkIn !== block.startDate ||
        input.checkOut !== block.endDate
      ) {
        throw new VillaDbError(
          'CONFLICT',
          `block ${block.id} is ${block.startDate}→${block.endDate}, form said ${input.checkIn}→${input.checkOut}`,
          'These dates changed on the channel. Reload the page and try again.',
        );
      }

      const existing = await getChannelLinkedBooking(site, link);

      // A cancelled one does not stand in the way: cancelling by mistake must
      // not make a stay unrecordable for ever. It is noted on the new
      // booking's trail so the pair is not a mystery later.
      if (existing && existing.status !== 'cancelled') {
        throw new VillaDbError(
          'CONFLICT',
          `booking ${existing.id} already fulfils ${link.externalUid}`,
          'This stay has already been filled in.',
        );
      }

      const basePaise = input.baseAmount
        ? Math.round(input.baseAmount * 100)
        : Math.round((input.totalAmount ?? 0) * 100);
      const taxPaise = input.baseAmount
        ? Math.round((input.gstAmount ?? 0) * 100)
        : 0;
      const totalPaise = input.baseAmount
        ? basePaise + taxPaise
        : Math.round((input.totalAmount ?? 0) * 100);

      let booking: SiteBooking;

      const guestFullName = [input.firstName, input.lastName]
        .filter(Boolean)
        .join(' ');

      try {
        booking = await createOfflineBooking(
          site,
          {
            guestName: guestFullName,
            salutation: input.salutation,
            firstName: input.firstName,
            lastName: input.lastName || null,
            guestEmail: input.guestEmail || '',
            guestPhone: input.guestPhone
              ? normalizePhoneNumber(input.guestPhone)
              : '',
            adults: input.adults,
            children: input.children,
            infants: input.infants,
            checkIn: block.startDate,
            checkOut: block.endDate,
            baseAmount: fromPaiseToString(basePaise),
            extraGuestAmount: '0',
            taxAmount: fromPaiseToString(taxPaise),
            totalAmount: fromPaiseToString(totalPaise),
            specialRequests: input.specialRequests,
            channel: channelValueForFeed(block.channelName),
            paymentStatus: 'paid',
            // The stay is already sold; our own sales cutoff has no say in it.
            ignoreCutoff: true,
            source: link,
          },
          actor,
        );
      } catch (error) {
        // The site creates the row pending and confirms it in a second
        // statement. When that second step fails, a pending row is left
        // holding this event's link: no list view shows it, nothing will
        // confirm it, and it would block the stay from ever being recorded
        // again. Free the link before giving up, so the operator can retry.
        if (isVillaDbError(error) && error.code === 'HOLD_LAPSED') {
          await clearChannelLink(site, link).catch(async (e: unknown) =>
            (await getLogger()).error(
              { uid: link.externalUid, error: String(e) },
              'villa channel enrich: could not free a stranded link',
            ),
          );
        }

        if (isVillaDbError(error) && error.code === 'DATE_BLOCKED') {
          const allBlocks = await listBlocks(
            site,
            block.startDate,
            block.endDate,
          ).catch(() => []);
          const manualConflicts = allBlocks.filter(
            (b) =>
              b.source === 'manual' &&
              b.startDate < block.endDate &&
              b.endDate > block.startDate,
          );
          if (manualConflicts.length > 0) {
            const names = manualConflicts
              .map(
                (c) =>
                  `"${c.notes ? blockNoteForDisplay(c.notes) : c.reason || 'Blocked'}" (${formatDateReadable(c.startDate)} – ${formatDateReadable(c.endDate)})`,
              )
              .join(', ');
            throw new VillaDbError(
              'DATE_BLOCKED',
              `conflicts with manual blocks: ${names}`,
              `These dates overlap with manual calendar block(s): ${names}. Please release them in Calendar first.`,
            );
          }
        }

        throw error;
      }

      const channel = block.channelName ?? 'the channel';
      const chargesNote =
        input.airbnbCharges && input.airbnbCharges > 0
          ? `${channel} charges: ₹${input.airbnbCharges.toLocaleString('en-IN')}`
          : null;
      const note = [
        `Recorded from the ${channel} calendar`,
        block.notes ? blockNoteForDisplay(block.notes) : null,
        chargesNote,
        existing
          ? `Replaces cancelled booking ${existing.bookingCode ?? existing.referenceNumber}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

      // The mirror goes first because `record_villa_payment` looks the stay
      // up in `villa_bookings_mirror` and refuses a payment for a booking it
      // cannot find there. It never throws (it logs and returns), so nothing
      // between the booking and its receipt can abort this.
      await mirrorBooking(site, booking, 'stay');

      // The stay is recorded as paid, so the money has to reach the ledger
      // too. Reports, the cash position and the booking's own Payments panel
      // all read receipts, not `payment_status`: without this the badge says
      // "Fully paid" while the panel says "Unpaid" and the period's revenue
      // is short by the whole amount.
      //
      // The request id is derived from the booking, so a retry of the same
      // payout is recognised by `record_villa_payment`'s idempotency check
      // instead of being counted twice.
      const { error: receiptError } = await client.rpc('record_villa_payment', {
        p_property_id: input.propertyId,
        p_site_booking_id: booking.id,
        p_request_id: channelPayoutRequestId(booking.id),
        p_mode: 'bank',
        p_amount: fromPaise(totalPaise),
        p_paid_on: todayIst(),
        p_reference:
          parseChannelNote(blockNoteForDisplay(block.notes)).confirmationCode ??
          '',
        p_payer_name: channel,
        p_note: `Payout from ${channel}`,
      });

      if (receiptError) {
        (await getLogger()).error(
          { bookingId: booking.id, code: receiptError.code },
          'villa channel enrich: payout receipt failed',
        );
      }

      // Option A: If channel charges / commission was deducted by Airbnb,
      // record an expense under 'commission' so debits, net income and reports tally.
      if (input.airbnbCharges && input.airbnbCharges > 0) {
        const { error: expenseError } = await client
          .from('villa_expenses')
          .insert({
            account_id: input.accountId,
            property_id: input.propertyId,
            category: 'commission',
            description: `${channel} charges · ${booking.bookingCode ?? booking.referenceNumber}`,
            vendor: channel,
            amount: input.airbnbCharges,
            gst_amount: 0,
            mode: 'bank',
            spent_on: block.startDate,
            // Shared with the void path's matcher, which finds this expense
            // by this note - there is no foreign key between the two.
            notes: commissionNoteFor(
              channel,
              booking.bookingCode ?? booking.referenceNumber,
            ),
            created_by: actor,
          });

        if (expenseError) {
          (await getLogger()).error(
            {
              bookingId: booking.id,
              code: expenseError.code,
              error: expenseError.message,
            },
            'villa channel enrich: commission expense creation failed',
          );
        }
      }

      // The trail comes last and never fails the call: the stay is recorded
      // and the money is in the ledger, and refusing to return a booking that
      // exists would only send the operator round again.
      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'created',
          note,
        },
        actor,
      ).catch(async (e: unknown) =>
        (await getLogger()).error(
          { bookingId: booking.id, error: String(e) },
          'villa channel enrich: activity record failed',
        ),
      );

      return booking;
    },

    /**
     * Corrects a booking's guest details: who they are, how to reach them,
     * how many of them, and what they asked for (edit booking Phase 1).
     *
     * Not dates, and not money. The guest counts are the one field with a
     * money consequence, and `checkGuestChange` declines the cases that would
     * leave the stay priced for a different party - see `lib/villa/booking-edit`.
     *
     * Ordering: the site is written first and is the source of truth. The
     * mirror and the activity entry follow, both best-effort, because a failed
     * audit write must not undo a correction the operator has already been
     * told about - and the next mirror sync repairs the copy either way.
     */
    async updateGuestDetails(
      input: z.output<typeof UpdateBookingSchema>,
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const existing = await getBooking(site, input.bookingId);

      if (!existing) throw new Error('That booking no longer exists.');

      if (
        !EDITABLE_BOOKING_STATUSES.includes(
          existing.status as (typeof EDITABLE_BOOKING_STATUSES)[number],
        )
      ) {
        throw new Error(
          `Only a confirmed or completed booking can be edited. This one is ${existing.status}.`,
        );
      }

      const { property } = await getPricingInputs(site);

      const refusal = checkGuestChange({
        before: {
          adults: existing.adults,
          children: existing.children,
          infants: existing.infants,
        },
        after: {
          adults: input.adults,
          children: input.children,
          infants: input.infants,
        },
        rules: {
          baseOccupancy: property.base_occupancy,
          maxOccupancy: property.max_occupancy,
        },
        // A stay a channel sold: the channel charged the guest, so the counts
        // are ours to correct while the money is not ours to restate.
        isChannelSold: existing.sourceFeedId !== null,
        // The booking's OWN basis. Reasoning from the live rate card alone
        // mis-reads a preferential price (which records no extras whatever the
        // headcount) and misses a `base_occupancy` changed after the sale.
        recordedExtraGuestPaise: existing.extraGuestAmountPaise,
      });

      if (refusal) throw new Error(refusal.message);

      // An off-list salutation is kept, never silently re-titled - but it can
      // only be the one already stored, so this is not a way to write a new
      // one. See the schema's note.
      const salutation = input.salutation.trim();

      if (
        salutation !== '' &&
        !SALUTATIONS.includes(salutation as (typeof SALUTATIONS)[number]) &&
        salutation !== (existing.salutation ?? '').trim()
      ) {
        throw new Error('Select a salutation.');
      }

      // Normalised to E.164 first, then stored in the site's own form, so the
      // diff below compares like with like instead of reporting a formatting
      // difference as a change of number.
      const phone = input.guestPhone.trim()
        ? (normalizePhoneNumber(input.guestPhone) ?? input.guestPhone.trim())
        : '';

      const edit = {
        salutation,
        expectedUpdatedAt: input.siteUpdatedAt,
        firstName: input.firstName,
        lastName: input.lastName,
        guestPhone: phone,
        guestEmail: input.guestEmail,
        adults: input.adults,
        children: input.children,
        infants: input.infants,
        specialRequests: input.specialRequests,
      };

      const before = toGuestDetails(existing);

      const booking = await updateBookingGuestDetails(
        site,
        input.bookingId,
        edit,
        actor,
      );

      const changes = describeBookingChanges(before, toGuestDetails(booking));

      // Checked, unlike every other activity write: the reason is the whole
      // point of this entry and no resync can reconstruct it, so if the row
      // did not land the operator has to hear about it. The commonest cause
      // is the migration that widens the action constraint not being applied
      // yet, which is a deploy-order mistake rather than a rare fault.
      const auditWritten = await recordBookingActivity(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'booking_updated',
          note: buildEditNote(input.reason, changes),
        },
        actor,
      );

      await mirrorBooking(site, booking);

      return { booking, changes, auditWritten };
    },

    /**
     * Adjusts a booking's money: the stay charge, the extra-guest charge and a
     * discount (edit booking Phase 2).
     *
     * GST and the total are DERIVED here, from the same `flat18` that priced
     * the stay, so an adjusted booking cannot quote a tax its own figures do
     * not support. The form never sends them.
     *
     * Three things it will not do, each for its own reason:
     *   - an INVOICED stay. The invoice states these figures, and correcting
     *     it needs a credit or debit note, which Ooruda cannot issue until
     *     M5b. Refusing beats issuing a wrong tax document.
     *   - a CHANNEL-SOLD stay. The channel charged the guest and is the
     *     merchant of record; restating the price here would only make Ooruda
     *     disagree with the payout.
     *   - a total BELOW the money already received, which would leave the
     *     booking owing the guest with no refund recorded. Refunding is its
     *     own action with its own trail, and this is not a back door to it.
     *
     * The first two are enforced in the site statement as well as here, so
     * they hold against an invoice issued or a stay cancelled in between.
     */
    async adjustMoney(
      input: z.output<typeof AdjustBookingMoneySchema>,
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const existing = await getBooking(site, input.bookingId);

      if (!existing) throw new Error('That booking no longer exists.');

      // `!= null` rather than truthiness, matching the site statement's
      // `.is('invoice_number', null)` exactly: if the two disagreed, the
      // service would pass, the UPDATE would match nothing, and the operator
      // would be told someone else had changed the booking.
      if (existing.invoiceNumber != null) {
        throw new Error(
          `This stay has been invoiced (${existing.invoiceNumber}). Changing the amount needs a credit or debit note, which is not available yet.`,
        );
      }

      if (existing.sourceFeedId !== null) {
        throw new Error(
          'This stay was sold by a booking channel, which charged the guest. Change the amount on the channel instead.',
        );
      }

      if (
        !EDITABLE_BOOKING_STATUSES.includes(
          existing.status as (typeof EDITABLE_BOOKING_STATUSES)[number],
        )
      ) {
        throw new Error(
          `Only a confirmed or completed booking can be adjusted. This one is ${existing.status}.`,
        );
      }

      if (!adjustmentsAvailable()) {
        throw new Error(
          'Adjusting an amount is not available under the per-night GST slab: it needs the charge for each night, not a total.',
        );
      }

      const before: BookingMoney = {
        basePaise: existing.baseAmountPaise,
        extraGuestPaise: existing.extraGuestAmountPaise,
        discountPaise: existing.discountAmountPaise,
        taxPaise: existing.taxAmountPaise,
        totalPaise: existing.totalAmountPaise,
      };

      // Does the stored tax follow from the stored figures? If not, this stay
      // was priced on some other basis, and recomputing would restate its tax
      // even on a save with no edits - logged against an operator who changed
      // nothing.
      if (!basisIsReproducible(before, existing.nights)) {
        throw new Error(
          'This stay\u2019s GST does not follow from its own figures, so it was priced outside the current rate card. Adjusting it here would restate the tax. Record the change as a payment or refund instead.',
        );
      }

      const next = {
        basePaise: Math.round(input.baseAmount * 100),
        extraGuestPaise: Math.round(input.extraGuestAmount * 100),
        discountPaise: Math.round(input.discountAmount * 100),
      };

      // What has actually been banked, net of refunds - not `payment_status`,
      // which lags, and not the booking's own total.
      const { summary } = await loadLedger(client, site, existing);

      const refusal = checkAdjustment({
        next,
        receivedPaise: summary.netPaidPaise,
        nights: existing.nights,
      });

      if (refusal) throw new Error(refusal.message);

      const money = recomputeMoney(next, existing.nights);

      const booking = await updateBookingMoney(
        site,
        input.bookingId,
        { ...money, expectedUpdatedAt: input.siteUpdatedAt },
        actor,
      );

      // The receipts check above is a read-then-write, and the compare-and-set
      // CANNOT close it: receipts live in Ooruda's `villa_booking_payments`,
      // and `record_villa_payment` never touches the site's `bookings`
      // row - so a payment banked in between leaves `updated_at` unchanged and
      // the write succeeds. One admin in two tabs is enough to drop a total
      // below the money received, which is the silent refund this guard exists
      // to prevent.
      //
      // So it is checked again against the figures that actually landed, and
      // put back if it no longer holds. A compensating write rather than a
      // lock, because the proper fix is for `record_villa_payment` to take the
      // same advisory lock, and that is a migration on the payments path.
      const after = await loadLedger(client, site, booking);

      if (after.summary.netPaidPaise > booking.totalAmountPaise) {
        await updateBookingMoney(
          site,
          input.bookingId,
          { ...before, expectedUpdatedAt: booking.updatedAt ?? '' },
          actor,
        ).catch(async (error: unknown) =>
          // Could not put it back: say so loudly. The booking is now below its
          // receipts and only a person can decide what should happen.
          (await getLogger()).error(
            { bookingId: booking.id, error: String(error) },
            'villa adjust: could not restore figures after a late payment; booking is below its receipts',
          ),
        );

        throw new Error(
          'A payment was recorded while you were adjusting this booking, and the new total is below the money received. Nothing was changed. Reload and try again.',
        );
      }

      const changes = describeMoneyChange(before, {
        basePaise: booking.baseAmountPaise,
        extraGuestPaise: booking.extraGuestAmountPaise,
        discountPaise: booking.discountAmountPaise,
        taxPaise: booking.taxAmountPaise,
        totalPaise: booking.totalAmountPaise,
      });

      // The total moved, so what the guest owes has moved with it: a stay that
      // was 'paid' at the old figure may now be part-paid, and the reverse.
      const synced = await resyncPaymentStatus(site, booking, actor);

      const auditWritten = await recordBookingActivity(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'amount_adjusted',
          note: buildEditNote(input.reason, changes),
        },
        actor,
      );

      await mirrorBooking(site, synced ?? booking);

      return { booking, changes, auditWritten };
    },

    /**
     * Retires a channel stay that was filled in by mistake, money included.
     *
     * Cancelling alone does not do this: it flips the site status and leaves
     * the payout receipt standing, and Reports counts receipts without
     * joining booking status - so a cancelled-but-not-voided enrichment keeps
     * its payout counted as cash received. See `lib/villa/enrichment-void`
     * for why the site status still becomes 'cancelled' rather than a new
     * 'voided' value, and why there is no check-in date restriction.
     *
     * THE STAY IS CANCELLED FIRST, and nothing after it throws.
     *
     * The money used to come first, on the reasoning that reversing it early
     * fails safe. It does not. `cancelBooking` only matches 'confirmed' rows,
     * so a COMPLETED stay - which is most of them, because a wrong enrichment
     * surfaces when the payout fails to reconcile - had its receipt voided and
     * its commission expense deleted and then threw, leaving the money gone,
     * the stay still completed, and no activity row at all. A retry could not
     * mend it either: the receipt no longer matched `voided_at is null`, so
     * the booking was wedged for good.
     *
     * Cancelling first inverts that. The one step that can legitimately fail -
     * on a concurrent cancel or check-out - now fails before anything is
     * destroyed, and its worst case afterwards is a cancelled stay whose
     * payout is still counted, which is simply today's behaviour and is both
     * detectable and fixable from the Payments panel. Each later step records
     * what it managed and the operator is told which remedy to apply.
     */
    async voidEnrichment(
      input: z.output<typeof VoidEnrichmentSchema>,
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const existing = await getBooking(site, input.bookingId);

      if (!existing) throw new Error('That booking no longer exists.');

      const refusal = checkVoidable(existing);

      if (refusal) throw new Error(refusal.message);

      const bookingRef = existing.bookingCode ?? existing.referenceNumber;

      // 1. Cancel on the site. 'cancelled' specifically: it is the one status
      // villa-booking's channel-event unique index excludes, so the same iCal
      // event can be enriched again afterwards. Before any money moves.
      const booking = await cancelBookingForVoid(site, input.bookingId, actor);

      const outcome: VoidOutcome = { receipt: 'none', commission: 'none' };

      // 2. The auto-recorded payout receipt, found by the same derived request
      // id enrichment wrote it with rather than by amount or date.
      const { data: receipts, error: receiptsError } = await client
        .from('villa_booking_payments')
        .select('id')
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', booking.id)
        .eq('request_id', channelPayoutRequestId(booking.id))
        .is('voided_at', null);

      if (receiptsError) {
        outcome.receipt = 'failed';
        (await getLogger()).error(
          { bookingId: booking.id, code: receiptsError.code },
          'villa void enrichment: payout receipt lookup failed',
        );
      } else {
        for (const receipt of receipts ?? []) {
          const { error } = await client.rpc('void_villa_payment', {
            p_payment_id: receipt.id,
            p_reason: `Enrichment voided: ${input.reason}`,
          });

          if (error) {
            outcome.receipt = 'failed';
            (await getLogger()).error(
              {
                bookingId: booking.id,
                paymentId: receipt.id,
                code: error.code,
              },
              'villa void enrichment: could not void the payout receipt',
            );
          } else if (outcome.receipt !== 'failed') {
            outcome.receipt = 'voided';
          }
        }
      }

      // 3. The commission expense, linked only by the booking reference in its
      // note (there is no foreign key). Matched in the query rather than over
      // every commission row the property has: the unbounded read was capped
      // at `max_rows` and silently reported "no commission" once a property
      // had more than that, while telling the operator the void was clean.
      //
      // Deleted on an unambiguous single match and otherwise left for a
      // person: `villa_expenses.amount` must be positive and there is no soft
      // delete, so deletion is the only way back - reason enough not to guess
      // which row.
      const { data: expenses, error: expensesError } = await client
        .from('villa_expenses')
        .select('id, amount, notes')
        .eq('account_id', input.accountId)
        .eq('property_id', input.propertyId)
        .eq('category', 'commission')
        .ilike('notes', `%${likeEscape(commissionNoteFragment(bookingRef))}%`)
        .limit(5);

      if (expensesError) {
        // Not folded into 'none': "there was nothing to remove" and "I could
        // not look" are different things to tell an operator.
        outcome.commission = 'unknown';
        (await getLogger()).error(
          { bookingId: booking.id, code: expensesError.code },
          'villa void enrichment: commission lookup failed',
        );
      } else {
        const matches = (expenses ?? []).filter((e) =>
          commissionNoteMatches(e.notes, bookingRef),
        );

        if (matches.length === 1) {
          const match = matches[0]!;
          const { error } = await client
            .from('villa_expenses')
            .delete()
            .eq('id', match.id)
            .eq('property_id', input.propertyId);

          if (error) {
            outcome.commission = 'unknown';
            (await getLogger()).error(
              { bookingId: booking.id, code: error.code },
              'villa void enrichment: commission delete failed',
            );
          } else {
            outcome.commission = 'removed';
            outcome.commissionAmount = Number(match.amount);
          }
        } else if (matches.length > 1) {
          outcome.commission = 'ambiguous';
        }
      }

      // 4. Re-derive payment_status from the ledger. Enrichment created the
      // booking as 'paid', and voiding its only receipt leaves that standing
      // on both the site and the mirror - so every badge reading
      // `payment_status` rather than the receipts would show a cancelled,
      // reversed stay as "Fully paid". Best-effort, as it is on the payments
      // service, and it re-mirrors on success.
      const synced = await resyncPaymentStatus(site, booking, actor);

      const auditWritten = await recordBookingActivity(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'enrichment_voided',
          note: buildVoidNote(input.reason, outcome),
        },
        actor,
      );

      await mirrorBooking(site, synced ?? booking);
      await releaseGuestIds(input.accountId, input.propertyId, booking.id);

      return { booking, outcome, auditWritten };
    },

    async cancel(
      input: z.output<typeof CancelBookingSchema>,
      role: VillaRole,
      actor: string,
    ) {
      const [
        { data: reason, error: reasonError },
        { data: settings, error: settingsError },
      ] = await Promise.all([
        client
          .from('villa_cancellation_reasons')
          .select('code, note_required, is_active')
          .eq('code', input.reasonCode)
          .maybeSingle(),
        client
          .from('villa_account_settings')
          .select('managers_can_cancel')
          .eq('account_id', input.accountId)
          .maybeSingle(),
      ]);

      if (reasonError || settingsError) {
        (await getLogger()).error(
          { code: reasonError?.code ?? settingsError?.code },
          'villa cancel: lookup failed',
        );
        throw new Error('Could not cancel right now. Please try again.');
      }

      if (role !== 'villa_admin' && !settings?.managers_can_cancel) {
        throw new Error('Only a villa admin can cancel bookings.');
      }

      if (!reason?.is_active) {
        throw new Error('Pick a cancellation reason.');
      }

      if (reason.note_required && !input.note) {
        throw new Error('Add a note explaining this cancellation.');
      }

      const site = await getVillaSite(input.accountId, input.propertyId);
      const booking = await cancelBooking(site, input.bookingId, actor);

      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'cancelled',
          reasonCode: reason.code,
          note: input.note,
        },
        actor,
      );
      await mirrorBooking(site, booking);
      await releaseGuestIds(input.accountId, input.propertyId, booking.id);

      return booking;
    },

    /**
     * Undo a check-out (pressed by mistake, or the guest stayed on), within
     * a day. The thank-you email then waits for the next check-out.
     */
    async reopen(input: z.output<typeof ReopenStaySchema>, actor: string) {
      const { data: last, error } = await client
        .from('villa_booking_activity')
        .select('action, created_at')
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId)
        .in('action', ['completed', 'reopened'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error('Could not check the booking history.');

      if (
        !last ||
        last.action !== 'completed' ||
        Date.now() - Date.parse(last.created_at) > 24 * 3_600_000
      ) {
        throw new Error('A check-out can be undone only within a day.');
      }

      const site = await getVillaSite(input.accountId, input.propertyId);
      const booking = await reopenStay(site, input.bookingId, actor);

      await mirrorBooking(site, booking);

      // Undoing the check-out has to clear its timestamp, or the guest stays
      // on the Today board as departed while being back in house. Same
      // best-effort handling as the write in `complete`.
      const { error: checkedOutError } = await getSupabaseServerAdminClient()
        .from('villa_bookings_mirror')
        .update({ checked_out_at: null })
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId);

      if (checkedOutError) {
        (await getLogger()).error(
          { bookingId: input.bookingId, error: checkedOutError.message },
          'villa check-out timestamp clear failed',
        );
      }

      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'reopened',
        },
        actor,
      );

      return booking;
    },

    async checkIn(input: z.output<typeof CheckInStaySchema>, actor: string) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const booking = await getBooking(site, input.bookingId);

      if (!booking) {
        throw new VillaDbError('NOT_FOUND', input.bookingId);
      }

      if (booking.status !== 'confirmed') {
        throw new VillaDbError(
          'CONFLICT',
          `booking ${input.bookingId} is ${booking.status}`,
          `Only a confirmed stay can be checked in. This one is ${booking.status}.`,
        );
      }

      const admin = getSupabaseServerAdminClient();
      const now = new Date().toISOString();

      // `checked_in_at` is the whole state of a check-in: the badge, the
      // check-out gate and the Today board all read it. A failed or no-op
      // write must stop here rather than leave an activity row claiming a
      // check-in that nothing recorded - `select()` is what makes a
      // zero-row update (no mirror row for this booking) visible at all.
      const { data: mirrorRows, error: mirrorError } = await admin
        .from('villa_bookings_mirror')
        .update({ checked_in_at: now })
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId)
        .select('site_booking_id');

      if (mirrorError) {
        (await getLogger()).error(
          { bookingId: input.bookingId, error: mirrorError.message },
          'villa check-in mirror update failed',
        );

        throw new VillaDbError(
          'CONFLICT',
          `check-in mirror update failed for ${input.bookingId}: ${mirrorError.message}`,
          'Could not record the check-in. Please try again.',
        );
      }

      if (!mirrorRows?.length) {
        (await getLogger()).error(
          { bookingId: input.bookingId, propertyId: input.propertyId },
          'villa check-in found no mirror row to update',
        );

        throw new VillaDbError(
          'NOT_FOUND',
          `no mirror row for booking ${input.bookingId}`,
          'Could not record the check-in: this booking is not synced yet. Please try again in a moment.',
        );
      }

      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'checked_in',
          note: 'Guest checked in at the villa',
        },
        actor,
      );

      return booking;
    },

    async complete(input: z.output<typeof CompleteStaySchema>, actor: string) {
      const admin = getSupabaseServerAdminClient();

      const { data: mirror, error: mirrorError } = await admin
        .from('villa_bookings_mirror')
        .select('checked_in_at')
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId)
        .maybeSingle();

      if (mirrorError) {
        (await getLogger()).error(
          { bookingId: input.bookingId, error: mirrorError.message },
          'villa check-out check-in status check failed',
        );

        throw new VillaDbError(
          'CONFLICT',
          `booking ${input.bookingId} check-in lookup failed`,
          'Could not verify check-in status. Please try again.',
        );
      }

      if (!mirror?.checked_in_at) {
        throw new VillaDbError(
          'CONFLICT',
          `booking ${input.bookingId} is not checked in`,
          'A stay must be checked in before it can be checked out.',
        );
      }

      const site = await getVillaSite(input.accountId, input.propertyId);
      const booking = await markStayCompleted(site, input.bookingId, actor);

      // Before the timestamp, so the row is certain to exist: a booking that
      // has never been mirrored has nothing to update. `toRow` leaves both
      // check-in and check-out timestamps out of the payload, so re-mirroring
      // never clears what was stamped here.
      await mirrorBooking(site, booking);

      // Unlike `checked_in_at`, this is a record of the check-out, not the
      // check-out itself - the site booking is already 'completed' and the
      // guest has left. A failure here costs the Today board its "departed"
      // row, which is not worth failing an action that has already happened,
      // so it is logged and swallowed.
      const { error: checkedOutError } = await getSupabaseServerAdminClient()
        .from('villa_bookings_mirror')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId);

      if (checkedOutError) {
        (await getLogger()).error(
          { bookingId: input.bookingId, error: checkedOutError.message },
          'villa check-out timestamp write failed',
        );
      }

      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'completed',
        },
        actor,
      );

      return booking;
    },
  };
}
