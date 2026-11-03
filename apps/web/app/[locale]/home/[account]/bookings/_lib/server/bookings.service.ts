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
  channelValueForFeed,
  clearChannelLink,
  createOfflineBooking,
  getBooking,
  getChannelLinkedBooking,
  markStayCompleted,
  reopenStay,
} from '~/lib/villa-db/bookings';
import { type VillaSite, getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { VillaDbError, isVillaDbError } from '~/lib/villa-db/errors';
import { getPricingInputs } from '~/lib/villa-db/rates';
import { recordBookingActivity } from '~/lib/villa/activity';
import { blockNoteForDisplay } from '~/lib/villa/calendar';
import { parseChannelNote } from '~/lib/villa/channel-note';
import { purgeExpiredGuestIds } from '~/lib/villa/guest-id-retention';
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
  StaySchema,
} from '../schemas/bookings.schema';

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

  async function record(
    entry: {
      accountId: string;
      propertyId: string;
      booking: Pick<SiteBooking, 'id' | 'bookingCode'>;
      action:
        | 'created'
        | 'cancelled'
        | 'completed'
        | 'reopened'
        | 'note'
        | 'checked_in';
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
          baseAmount: fromPaiseToString(q.basePaise),
          extraGuestAmount: fromPaiseToString(q.extraGuestPaise),
          taxAmount: fromPaiseToString(q.taxPaise),
          totalAmount: fromPaiseToString(q.totalPaise),
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
      // figure instead of "a deposit was received". Written before the email
      // is queued below. A receipt that fails must not undo a booking the
      // guest has been promised, so it is logged for staff to add by hand.
      if (
        (input.paymentStatus === 'partially_paid' ||
          input.paymentStatus === 'paid') &&
        input.amountReceived > 0
      ) {
        if (input.amountReceived > fromPaise(q.totalPaise)) {
          throw new VillaDbError(
            'INVALID_INPUT',
            `advance ${input.amountReceived} over total ${q.totalPaise}`,
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

      const totalPaise = Math.round(input.totalAmount * 100);

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
            baseAmount: fromPaiseToString(totalPaise),
            extraGuestAmount: '0',
            taxAmount: '0',
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
      const note = [
        `Recorded from the ${channel} calendar`,
        block.notes ? blockNoteForDisplay(block.notes) : null,
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
        p_amount: input.totalAmount,
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
