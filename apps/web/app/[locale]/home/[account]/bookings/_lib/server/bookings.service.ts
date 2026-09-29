import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { getLogger } from '@kit/shared/logger';
import { normalizePhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { Database } from '~/lib/database.types';
import type { VillaRole } from '~/lib/roles';
import { checkAvailability } from '~/lib/villa-db/availability';
import {
  type SiteBooking,
  cancelBooking,
  createOfflineBooking,
  markStayCompleted,
} from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { VillaDbError } from '~/lib/villa-db/errors';
import { getPricingInputs } from '~/lib/villa-db/rates';
import { mirrorBooking } from '~/lib/villa/mirror';
import { fromPaise, fromPaiseToString } from '~/lib/villa/money';
import { type QuoteError, quoteStay } from '~/lib/villa/pricing';

import type {
  CancelBookingSchema,
  CompleteStaySchema,
  NewBookingSchema,
  StaySchema,
} from '../schemas/bookings.schema';

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
 * Bookings for a villa property. Callers authorise first; every site call is
 * scoped to the property by lib/villa-db. Amounts are always priced here on
 * the server — never taken from the browser.
 */
export function createBookingsService(client: Client) {
  async function priceStay(input: z.output<typeof StaySchema>) {
    const site = await getVillaSite(input.accountId, input.propertyId);
    const [availability, pricing] = await Promise.all([
      checkAvailability(site, input.checkIn, input.checkOut),
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

  async function record(
    entry: {
      accountId: string;
      propertyId: string;
      booking: Pick<SiteBooking, 'id' | 'bookingCode'>;
      action: 'created' | 'cancelled' | 'completed' | 'note';
      reasonCode?: string | null;
      note?: string | null;
    },
    actor: string,
  ) {
    // The site change has already happened; a failed trail entry must not
    // turn it into an error for the user. It is logged instead.
    // Service role only: members cannot write history directly (a hand-made
    // "cancelled" row would forge it). The caller has already authorised the
    // action and made the change on the booking site.
    const { error } = await getSupabaseServerAdminClient()
      .from('villa_booking_activity')
      .insert({
        account_id: entry.accountId,
        property_id: entry.propertyId,
        site_booking_id: entry.booking.id,
        booking_code: entry.booking.bookingCode,
        action: entry.action,
        reason_code: entry.reasonCode ?? null,
        note: entry.note || null,
        actor_user_id: actor,
      });

    if (error) {
      (await getLogger()).error(
        { bookingId: entry.booking.id, action: entry.action, code: error.code },
        'villa booking activity write failed',
      );
    }
  }

  return {
    async quote(input: z.output<typeof StaySchema>): Promise<QuoteView> {
      const { availability, result } = await priceStay(input);

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
        nightly: q.nights.map((n) => ({
          date: n.date,
          rate: fromPaise(n.ratePaise),
          weekend: n.isWeekend,
          rule: n.rule ?? null,
        })),
      };
    },

    async create(input: z.output<typeof NewBookingSchema>, actor: string) {
      const { site, availability, result } = await priceStay(input);

      if (availability !== 'AVAILABLE') {
        throw new VillaDbError(
          availability,
          `${input.checkIn} → ${input.checkOut}`,
        );
      }

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

      // create_booking_atomic re-checks availability under the site's lock,
      // so a clash since the quote is still refused here.
      const booking = await createOfflineBooking(
        site,
        {
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: normalizePhoneNumber(input.guestPhone),
          adults: input.adults,
          children: input.children,
          infants: input.infants,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          baseAmount: fromPaiseToString(q.basePaise),
          extraGuestAmount: fromPaiseToString(q.extraGuestPaise),
          taxAmount: fromPaiseToString(q.taxPaise),
          totalAmount: fromPaiseToString(q.totalPaise),
          specialRequests: input.specialRequests,
          channel: input.channel,
          paymentStatus: input.paymentStatus,
        },
        actor,
      );

      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'created',
          note: input.isEvent ? 'Event booking' : null,
        },
        actor,
      );
      await mirrorBooking(site, booking, input.isEvent ? 'event' : 'stay');

      return booking;
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

      if (role !== 'villa_owner' && !settings?.managers_can_cancel) {
        throw new Error('Only the villa owner can cancel bookings.');
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

      return booking;
    },

    async complete(input: z.output<typeof CompleteStaySchema>, actor: string) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const booking = await markStayCompleted(site, input.bookingId, actor);

      await record(
        {
          accountId: input.accountId,
          propertyId: input.propertyId,
          booking,
          action: 'completed',
        },
        actor,
      );
      await mirrorBooking(site, booking);

      return booking;
    },
  };
}
