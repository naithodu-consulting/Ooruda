import 'server-only';
import {
  CHANNEL_SOLD_CHANNEL_VALUES,
  EDITABLE_BOOKING_STATUSES,
  OFFLINE_CHANNEL_VALUES,
} from '~/lib/villa/constants';
import { toPaise } from '~/lib/villa/money';

import type { VillaSite } from './client';
import { nightsIn, todayIst } from './dates';
import {
  VillaDbError,
  fromSiteError,
  fromSiteWriteError,
  invalidAmount,
} from './errors';
import { withSyncLog } from './sync-log';

/**
 * Bookings on the villa-booking database (integration contract §5).
 *
 * Rules this module enforces:
 *   - new bookings ONLY via create_booking_atomic (its advisory lock is what
 *     makes double booking impossible), then the guarded pending→confirmed
 *     update; 0 rows updated means the hold lapsed → caller retries (§5.1)
 *   - never DELETE a booking; cancel it (§5.5)
 *   - never change dates in place (§5.4) — not offered here at all
 *   - every query is scoped to this property: villas may share one
 *     villa-booking project, and an id alone must never reach another villa
 *
 * Amounts arrive in rupees (Ooruda's unit) and cross into paise only here.
 */

/** Channels Ooruda may record (the site writes 'online' itself). */
export const OFFLINE_CHANNELS = OFFLINE_CHANNEL_VALUES;

export type OfflineChannel = (typeof OFFLINE_CHANNELS)[number];

/**
 * Channels Ooruda may record for a stay a booking channel sold (villa-booking
 * 00108 added them to `bookings.booking_channel`). These are never offered in
 * the new-booking form: such a booking exists only as the enrichment of an
 * imported block, and one entered freehand would hold the nights twice.
 */
export const CHANNEL_SOLD_CHANNELS = CHANNEL_SOLD_CHANNEL_VALUES;

export type ChannelSoldChannel = (typeof CHANNEL_SOLD_CHANNELS)[number];

/** 'Airbnb' → 'airbnb'; any other feed name → the generic 'channel'. */
export function channelValueForFeed(
  feedName: string | null,
): ChannelSoldChannel {
  return feedName?.trim().toLowerCase() === 'airbnb' ? 'airbnb' : 'channel';
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export interface NewOfflineBooking {
  guestName: string;
  salutation?: 'Mr' | 'Mrs' | 'Ms' | string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** '' when unknown — the site column is NOT NULL (contract §5.1). */
  guestEmail?: string | null;
  guestPhone?: string | null;
  adults: number;
  children?: number;
  infants?: number;
  checkIn: string;
  checkOut: string;
  /** Rupees. total must equal base + extraGuest + tax. */
  baseAmount: number | string;
  extraGuestAmount: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  specialRequests?: string | null;
  channel: OfflineChannel | ChannelSoldChannel;
  paymentStatus: PaymentStatus;
  /**
   * The channel event this booking fulfils. Given only by the enrichment of
   * an imported stay: the site excuses that one block from its occupancy test
   * (and skips the past-check-in guard), so the booking can cover the nights
   * the feed is already holding. See lib/villa/channel-link.
   */
  source?: { feedId: string; externalUid: string } | null;
  /**
   * Record this stay even though its check-in is past the property's booking
   * cutoff. The cutoff closes PUBLIC sales; the villa's own admin still has to
   * be able to write down a stay agreed by phone. Occupancy is unaffected: the
   * site refuses a night already sold or blocked either way.
   */
  ignoreCutoff?: boolean;
}

export interface SiteBooking {
  id: string;
  bookingCode: string | null;
  referenceNumber: string;
  status: string;
  paymentStatus: string;
  channel: string | null;
  guestName: string;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  /** Paise, exactly as stored on the site. Convert with fromPaise(). */
  baseAmountPaise: number;
  extraGuestAmountPaise: number;
  taxAmountPaise: number;
  totalAmountPaise: number;
  /** Paise taken off before GST; 0 when no code was used. */
  discountAmountPaise: number;
  /** Coupon code applied at checkout, or null. */
  discountCode: string | null;
  idStatus: string;
  invoiceNumber: string | null;
  specialRequests: string | null;
  /** The channel feed whose event this booking fulfils; null for direct ones. */
  sourceFeedId: string | null;
  sourceExternalUid: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

const BOOKING_COLUMNS =
  'id, booking_code, reference_number, status, payment_status, booking_channel, guest_name, guest_salutation, guest_first_name, guest_last_name, guest_email, guest_phone, check_in, check_out, num_nights, num_adults, num_children, num_infants, base_amount, extra_guest_amount, tax_amount, total_amount, discount_amount, discount_code, id_status, invoice_number, special_requests, source_feed_id, source_external_uid, updated_at, created_at';

type BookingRow = {
  id: string;
  booking_code: string | null;
  reference_number: string;
  status: string | null;
  payment_status: string | null;
  booking_channel: string | null;
  guest_name: string;
  guest_salutation?: string | null;
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_nights: number;
  num_adults: number;
  num_children: number | null;
  num_infants: number | null;
  base_amount: number;
  extra_guest_amount: number | null;
  tax_amount: number;
  total_amount: number;
  discount_amount: number | null;
  discount_code: string | null;
  id_status: string | null;
  invoice_number: string | null;
  special_requests: string | null;
  source_feed_id: string | null;
  source_external_uid: string | null;
  updated_at: string | null;
  created_at: string | null;
};

function toBooking(row: BookingRow): SiteBooking {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    referenceNumber: row.reference_number,
    status: row.status ?? 'pending',
    paymentStatus: row.payment_status ?? 'unpaid',
    channel: row.booking_channel,
    guestName: row.guest_name,
    salutation: row.guest_salutation ?? null,
    firstName: row.guest_first_name ?? null,
    lastName: row.guest_last_name ?? null,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.num_nights,
    adults: row.num_adults,
    children: row.num_children ?? 0,
    infants: row.num_infants ?? 0,
    baseAmountPaise: row.base_amount,
    extraGuestAmountPaise: row.extra_guest_amount ?? 0,
    taxAmountPaise: row.tax_amount,
    totalAmountPaise: row.total_amount,
    discountAmountPaise: row.discount_amount ?? 0,
    discountCode: row.discount_code ?? null,
    idStatus: row.id_status ?? 'pending',
    invoiceNumber: row.invoice_number,
    specialRequests: row.special_requests ?? null,
    sourceFeedId: row.source_feed_id,
    sourceExternalUid: row.source_external_uid,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

/**
 * The site stores Indian mobiles as 10 digits ([6-9]XXXXXXXXX), which its
 * checkout validates and staff search by; other numbers stay E.164.
 */
export function toSitePhone(phone: string | null | undefined): string {
  const value = phone?.trim() ?? '';
  const indian = /^\+91([6-9]\d{9})$/.exec(value);

  return indian ? indian[1]! : value;
}

function paise(value: number | string, field: string): number {
  try {
    return toPaise(value);
  } catch {
    throw invalidAmount(field);
  }
}

function nonNegativeInt(value: number | undefined, field: string): number {
  const n = value ?? 0;

  if (!Number.isInteger(n) || n < 0) {
    throw new VillaDbError(
      'INVALID_INPUT',
      `${field} must be a whole number ≥ 0`,
    );
  }

  return n;
}

/**
 * Records a phone/WhatsApp/walk-in booking (or an event) as a CONFIRMED
 * booking on the site. Returns the booking with its site-assigned code.
 */
export async function createOfflineBooking(
  site: VillaSite,
  input: NewOfflineBooking,
  actorUserId: string | null,
): Promise<SiteBooking> {
  const nights = nightsIn(input.checkIn, input.checkOut);

  const channelAllowed = input.source
    ? (CHANNEL_SOLD_CHANNELS as readonly string[]).includes(input.channel)
    : (OFFLINE_CHANNELS as readonly string[]).includes(input.channel);

  if (!channelAllowed) {
    throw new VillaDbError('INVALID_INPUT', `bad channel ${input.channel}`);
  }

  if (!input.guestName.trim()) {
    throw new VillaDbError(
      'INVALID_INPUT',
      'guest name required',
      'Enter the guest name.',
    );
  }

  const adults = nonNegativeInt(input.adults, 'adults');

  if (adults < 1) {
    throw new VillaDbError(
      'INVALID_INPUT',
      'at least one adult',
      'A booking needs at least one adult.',
    );
  }

  const children = nonNegativeInt(input.children, 'children');
  const infants = nonNegativeInt(input.infants, 'infants');

  const base = paise(input.baseAmount, 'the stay amount');
  const extra = paise(input.extraGuestAmount, 'extra guests');
  const tax = paise(input.taxAmount, 'tax');
  const total = paise(input.totalAmount, 'the total');

  if ([base, extra, tax, total].some((v) => v < 0)) {
    throw new VillaDbError('INVALID_INPUT', 'negative amount');
  }

  if (base + extra + tax !== total) {
    throw new VillaDbError(
      'INVALID_INPUT',
      `total ${total} != base ${base} + extra ${extra} + tax ${tax}`,
      'The total must equal the stay amount plus extras plus tax.',
    );
  }

  return withSyncLog(site, 'booking.create', actorUserId, async () => {
    const { data: created, error: createError } = await site.client.rpc(
      'create_booking_atomic',
      {
        p_property_id: site.sitePropertyId,
        p_guest_name: input.guestName.trim(),
        p_guest_email: input.guestEmail?.trim() ?? '',
        p_guest_phone: toSitePhone(input.guestPhone),
        // The site's typed signature takes these as optional, not nullable;
        // omitting one lets the function's own DEFAULT NULL stand, which is
        // the same booking either way.
        p_guest_salutation: input.salutation ?? undefined,
        p_guest_first_name: input.firstName?.trim() || undefined,
        p_guest_last_name: input.lastName?.trim() || undefined,
        p_num_adults: adults,
        p_num_children: children,
        p_num_infants: infants,
        p_check_in: input.checkIn,
        p_check_out: input.checkOut,
        p_num_nights: nights,
        p_base_amount: base,
        p_extra_guest_amount: extra,
        p_tax_amount: tax,
        p_total_amount: total,
        // The SQL parameter is nullable `text` (contract §5.1 passes null);
        // generated RPC arg types cannot express that.
        p_special_requests: (input.specialRequests?.trim() || null) as string,
        p_ignore_cutoff: input.ignoreCutoff ?? false,
        // Generated arg types are non-nullable; the SQL parameters default to
        // NULL, which is what a direct booking passes.
        ...(input.source
          ? {
              p_source_feed_id: input.source.feedId,
              p_source_external_uid: input.source.externalUid,
            }
          : {}),
      },
    );

    // If this times out, a pending hold may exist; it lapses by itself in 15
    // minutes (contract §5.1), so UNCERTAIN is the honest answer.
    if (createError) throw fromSiteWriteError(createError);

    const bookingId = (Array.isArray(created) ? created[0] : created)
      ?.booking_id;

    if (!bookingId) {
      throw new VillaDbError('UNKNOWN', 'create_booking_atomic returned no id');
    }

    // Guarded confirm: only a still-pending row. 0 rows = the 15-minute hold
    // lapsed and someone else may now hold the dates (contract §5.1).
    const { data: confirmed, error: confirmError } = await site.client
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_status: input.paymentStatus,
        booking_channel: input.channel,
        hold_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .eq('status', 'pending')
      // A lapsed hold stays 'pending' until the site's nightly job, and
      // check_availability already ignores it: someone else may hold the
      // dates now. Only a LIVE hold may be confirmed.
      .gt('hold_expires_at', new Date().toISOString())
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    const confirmedRow = confirmed as BookingRow | null;

    if (confirmError) {
      const mapped = fromSiteWriteError(confirmError);

      if (mapped.code !== 'UNCERTAIN') throw mapped;

      // The confirm may have committed without us hearing back: look.
      const current = await getBooking(site, bookingId).catch(() => null);

      if (current?.status !== 'confirmed') throw mapped;

      return { result: current, siteId: current.bookingCode ?? current.id };
    }

    if (!confirmedRow)
      throw new VillaDbError('HOLD_LAPSED', `booking ${bookingId}`);

    const booking = toBooking(confirmedRow);

    invalidateBookingsViewCache(site.sitePropertyId);
    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
}

/**
 * Cancels a confirmed booking. The dates are free immediately. Refunds are
 * handled separately (plan §9b); this only changes status.
 *
 * Pending rows are NOT cancellable here: a pending booking is usually a guest
 * in the middle of online checkout, and cancelling it would strand their
 * payment. Unpaid holds lapse by themselves after 15 minutes.
 */
export async function cancelBooking(
  site: VillaSite,
  bookingId: string,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.cancel', actorUserId, async () => {
    const { data, error } = await site.client
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .eq('status', 'confirmed')
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (!data) {
      const existing = await getBooking(site, bookingId);
      throw existing
        ? new VillaDbError(
            'CONFLICT',
            `booking ${bookingId} is ${existing.status}`,
            `This booking is already ${existing.status}.`,
          )
        : new VillaDbError('NOT_FOUND', `booking ${bookingId}`);
    }

    const booking = toBooking(data as BookingRow);

    invalidateBookingsViewCache(site.sitePropertyId);
    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
}

/** A booking's money, in paise, for an adjustment write. */
export interface BookingMoneyWrite {
  basePaise: number;
  extraGuestPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** `updated_at` as the caller last saw it; empty skips the check. */
  expectedUpdatedAt: string;
}

/**
 * Rewrites a booking's money on the site (edit booking Phase 2).
 *
 * The guards are in the statement, not only in the service that calls it, so
 * they hold under a concurrent invoice issue or check-out rather than being
 * merely checked a moment earlier:
 *
 *   invoice_number is null   an issued tax invoice states these figures, and
 *                            correcting it needs a credit or debit note, which
 *                            Ooruda cannot issue yet (M5b)
 *   source_feed_id is null   a channel is the merchant of record for the stay
 *                            it sold; restating its price here would only make
 *                            Ooruda disagree with the payout
 *   status in (...)          same reasoning as editing guest details
 *   updated_at = expected    compare-and-set, so two adjustments cannot each
 *                            overwrite the other's figures
 */
/** The new span and the money that goes with it. */
export interface BookingDatesWrite {
  checkIn: string;
  checkOut: string;
  nights: number;
  basePaise: number;
  extraGuestPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  expectedUpdatedAt?: string;
  /** Staff moving a stay past the cutoff on purpose. */
  ignoreCutoff?: boolean;
}

/**
 * Moves a confirmed booking to different nights, atomically.
 *
 * Unlike every other write in this file, this one goes through an RPC rather
 * than a PATCH, because it is the one write that must release nights and
 * claim nights in the same breath. A PATCH would set the new dates without
 * ever checking whether anybody else holds them, and a read-then-PATCH has a
 * gap in which the website or an iCal sync can take them — losing that race
 * leaves the guest with no booking at all, since their old nights are gone
 * too. `move_booking_dates` (villa-booking 00112) does the availability check
 * and the update in one statement, excluding the booking from its own check.
 *
 * Its refusals arrive as Postgres exceptions prefixed with a code, which
 * `fromSiteWriteError` maps the same way it maps `create_booking_atomic`'s.
 */
export async function moveBookingDates(
  site: VillaSite,
  bookingId: string,
  dates: BookingDatesWrite,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.move_dates', actorUserId, async () => {
    const { data, error } = await site.client.rpc('move_booking_dates', {
      p_booking_id: bookingId,
      p_check_in: dates.checkIn,
      p_check_out: dates.checkOut,
      p_num_nights: dates.nights,
      p_base_amount: dates.basePaise,
      p_extra_guest_amount: dates.extraGuestPaise,
      p_tax_amount: dates.taxPaise,
      p_total_amount: dates.totalPaise,
      p_discount_amount: dates.discountPaise,
      p_expected_updated_at: dates.expectedUpdatedAt || null,
      p_ignore_cutoff: dates.ignoreCutoff ?? false,
    });

    if (error) throw fromSiteWriteError(error);

    const row = (Array.isArray(data) ? data[0] : data) as BookingRow | null;

    if (!row) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

    const booking = toBooking(row);

    // Same 30-second list cache as every other write here: without this the
    // bookings list and the calendar show the old nights for half a minute.
    invalidateBookingsViewCache(site.sitePropertyId);

    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
}

export async function updateBookingMoney(
  site: VillaSite,
  bookingId: string,
  money: BookingMoneyWrite,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.adjust', actorUserId, async () => {
    let query = site.client
      .from('bookings')
      .update({
        base_amount: money.basePaise,
        extra_guest_amount: money.extraGuestPaise,
        discount_amount: money.discountPaise,
        tax_amount: money.taxPaise,
        total_amount: money.totalPaise,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .is('invoice_number', null)
      .is('source_feed_id', null)
      .in('status', [...EDITABLE_BOOKING_STATUSES]);

    if (money.expectedUpdatedAt) {
      query = query.eq('updated_at', money.expectedUpdatedAt);
    }

    const { data, error } = await query.select(BOOKING_COLUMNS).maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (data) {
      const booking = toBooking(data as BookingRow);

      // The list view caches for 30s per site property, and `revalidatePath`
      // re-renders FROM that cache - so without this the bookings list showed
      // the old total and payment status for half a minute, and reloading did
      // not help. Every other write in this file does the same.
      invalidateBookingsViewCache(site.sitePropertyId);
      return { result: booking, siteId: booking.bookingCode ?? booking.id };
    }

    // Nothing matched: name the actual reason rather than reporting a live
    // booking as missing.
    const existing = await getBooking(site, bookingId);

    if (!existing) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

    if (existing.invoiceNumber) {
      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} is invoiced as ${existing.invoiceNumber}`,
        `This stay has been invoiced (${existing.invoiceNumber}). Changing the amount needs a credit or debit note, which is not available yet.`,
      );
    }

    if (existing.sourceFeedId !== null) {
      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} was sold by feed ${existing.sourceFeedId}`,
        'This stay was sold by a booking channel, which charged the guest. Change the amount on the channel instead.',
      );
    }

    if (
      !EDITABLE_BOOKING_STATUSES.includes(
        existing.status as (typeof EDITABLE_BOOKING_STATUSES)[number],
      )
    ) {
      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} is ${existing.status}`,
        `Only a confirmed or completed booking can be adjusted. This one is ${existing.status}.`,
      );
    }

    throw new VillaDbError(
      'CONFLICT',
      `booking ${bookingId} changed during adjustment`,
      'Someone else changed this booking while you were adjusting it. Close this and open it again before you re-apply your change.',
    );
  });
}

/**
 * Cancels a stay from EITHER 'confirmed' or 'completed', for voiding a channel
 * enrichment.
 *
 * Separate from `cancelBooking`, which stays scoped to 'confirmed': cancelling
 * a finished stay is not something the normal cancel flow should offer, and
 * narrowing that function would have widened the user-facing action too.
 *
 * Voiding needs the wider scope because a wrong enrichment is usually found
 * after the stay has been checked out - when the channel's payout fails to
 * reconcile - and `cancelBooking` would refuse exactly those, after the void
 * had already reversed the money.
 */
export async function cancelBookingForVoid(
  site: VillaSite,
  bookingId: string,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.void', actorUserId, async () => {
    const { data, error } = await site.client
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .in('status', ['confirmed', 'completed'])
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (!data) {
      const existing = await getBooking(site, bookingId);
      throw existing
        ? new VillaDbError(
            'CONFLICT',
            `booking ${bookingId} is ${existing.status}`,
            `This stay is already ${existing.status}.`,
          )
        : new VillaDbError('NOT_FOUND', `booking ${bookingId}`);
    }

    const booking = toBooking(data as BookingRow);

    invalidateBookingsViewCache(site.sitePropertyId);
    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
}

/**
 * Marks a confirmed stay completed at check-out (a manager or owner action).
 * Allowed from the check-in date onward, so an early departure can be closed.
 */
export async function markStayCompleted(
  site: VillaSite,
  bookingId: string,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.complete', actorUserId, async () => {
    const { data, error } = await site.client
      .from('bookings')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .eq('status', 'confirmed')
      .lte('check_in', todayIst())
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (!data) {
      const existing = await getBooking(site, bookingId);

      if (!existing)
        throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

      throw existing.status !== 'confirmed'
        ? new VillaDbError(
            'CONFLICT',
            `booking ${bookingId} is ${existing.status}`,
            `Only a confirmed stay can be checked out. This one is ${existing.status}.`,
          )
        : new VillaDbError(
            'INVALID_INPUT',
            `check-in ${existing.checkIn} is in the future`,
            'A stay can be checked out only once it has started.',
          );
    }

    const booking = toBooking(data as BookingRow);

    invalidateBookingsViewCache(site.sitePropertyId);
    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
}

/** One booking of this property by id, or null. */
export async function getBooking(
  site: VillaSite,
  bookingId: string,
): Promise<SiteBooking | null> {
  const { data, error } = await site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', bookingId)
    .eq('property_id', site.sitePropertyId)
    .maybeSingle();

  if (error) throw fromSiteError(error);

  return data ? toBooking(data as BookingRow) : null;
}

/** One booking of this property by its (already normalised) booking code. */
export async function getBookingByCode(
  site: VillaSite,
  bookingCode: string,
): Promise<SiteBooking | null> {
  const { data, error } = await site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('booking_code', bookingCode)
    .eq('property_id', site.sitePropertyId)
    .maybeSingle();

  if (error) throw fromSiteError(error);

  return data ? toBooking(data as BookingRow) : null;
}

/**
 * Bookings overlapping [from, to) that occupy or occupied the villa —
 * pending holds, confirmed and completed stays (not expired or cancelled).
 */
export async function listBookings(
  site: VillaSite,
  from: string,
  to: string,
): Promise<SiteBooking[]> {
  nightsIn(from, to);

  const { data, error } = await site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('property_id', site.sitePropertyId)
    .in('status', ['pending', 'confirmed', 'completed'])
    .lt('check_in', to)
    .gt('check_out', from)
    .order('check_in');

  if (error) throw fromSiteError(error);

  return (data ?? []).map((row) => toBooking(row as BookingRow));
}

export type BookingView = 'upcoming' | 'in_house' | 'past' | 'cancelled';

const BOOKINGS_VIEW_TTL_MS = 30_000;

const bookingsViewCache = new Map<
  string,
  { value: SiteBooking[]; expiresAt: number }
>();

export function invalidateBookingsViewCache(sitePropertyId?: string) {
  if (sitePropertyId) {
    for (const key of bookingsViewCache.keys()) {
      if (key.startsWith(sitePropertyId)) {
        bookingsViewCache.delete(key);
      }
    }
  } else {
    bookingsViewCache.clear();
  }
}

/**
 * Bookings for a list view, relative to today in India:
 *   upcoming   confirmed, check-in after today
 *   in_house   confirmed, today within [check_in, check_out]
 *   past       completed, or confirmed with check-out before today
 *   cancelled  cancelled (expired holds are never shown)
 */
export async function listBookingsByView(
  site: VillaSite,
  view: BookingView,
  limit = 100,
): Promise<SiteBooking[]> {
  const cacheKey = `${site.sitePropertyId}:${view}:${limit}`;
  const cached = bookingsViewCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const today = todayIst();
  let query = site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('property_id', site.sitePropertyId);

  if (view === 'upcoming') {
    query = query
      .eq('status', 'confirmed')
      .gt('check_in', today)
      .order('check_in');
  } else if (view === 'in_house') {
    query = query
      .eq('status', 'confirmed')
      .lte('check_in', today)
      .gte('check_out', today)
      .order('check_out');
  } else if (view === 'past') {
    query = query
      .or(`status.eq.completed,and(status.eq.confirmed,check_out.lt.${today})`)
      .order('check_in', { ascending: false });
  } else {
    query = query
      .eq('status', 'cancelled')
      .order('updated_at', { ascending: false });
  }

  const { data, error } = await query.limit(limit);

  if (error) throw fromSiteError(error);

  const result = (data ?? []).map((row) => toBooking(row as BookingRow));

  bookingsViewCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + BOOKINGS_VIEW_TTL_MS,
  });

  return result;
}

/**
 * Finds bookings by guest name, email, phone or booking code, across every
 * status except lapsed holds. Phone searches match the site's 10-digit form
 * however they are typed ("+91 98765 43210", "098765 43210").
 */
export async function searchBookings(
  site: VillaSite,
  query: string,
  limit = 50,
): Promise<SiteBooking[]> {
  const text = query
    .trim()
    .replace(/[%_,()]/g, ' ')
    .trim();

  if (!text) return [];

  const digits = text.replace(/\D/g, '');
  const phone =
    digits.length >= 6 ? digits.replace(/^(91|0)(?=[6-9]\d{9}$)/, '') : null;

  const terms = [
    `guest_name.ilike.%${text}%`,
    `guest_email.ilike.%${text}%`,
    `booking_code.ilike.%${text}%`,
  ];

  if (phone) terms.push(`guest_phone.ilike.%${phone}%`);

  const { data, error } = await site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('property_id', site.sitePropertyId)
    .in('status', ['pending', 'confirmed', 'completed', 'cancelled'])
    .or(terms.join(','))
    .order('check_in', { ascending: false })
    .limit(limit);

  if (error) throw fromSiteError(error);

  return (data ?? []).map((row) => toBooking(row as BookingRow));
}

/** Rows per page when copying bookings for the mirror. */
export const SYNC_PAGE_SIZE = 500;

/**
 * One page of the property's bookings for the Ooruda mirror, every status,
 * keyset-paged by id (stable even if bookings arrive mid-sync). Pass the last
 * id of the previous page as `afterId`. `checkOutFrom` limits it to stays
 * ending on or after that date: the site has no updated_at trigger yet
 * (villa-booking TODO 8d), so later syncs re-read a recent window instead of
 * "changed since".
 */
export async function listBookingsForSync(
  site: VillaSite,
  options: { checkOutFrom?: string; afterId?: string },
): Promise<SiteBooking[]> {
  let query = site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('property_id', site.sitePropertyId);

  if (options.checkOutFrom)
    query = query.gte('check_out', options.checkOutFrom);
  if (options.afterId) query = query.gt('id', options.afterId);

  const { data, error } = await query.order('id').limit(SYNC_PAGE_SIZE);

  if (error) throw fromSiteError(error);

  return (data ?? []).map((row) => toBooking(row as BookingRow));
}

/**
 * Updates the guest-ID status the guest's booking page shows (contract
 * §5.7). 'received' never downgrades a booking that is already 'verified'.
 * Only live stays (confirmed or checked out) are changed.
 */
export async function setIdStatus(
  site: VillaSite,
  bookingId: string,
  status: 'received' | 'verified',
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, `booking.id_${status}`, actorUserId, async () => {
    let query = site.client
      .from('bookings')
      .update({ id_status: status, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .in('status', ['confirmed', 'completed']);

    if (status === 'received') query = query.eq('id_status', 'pending');

    const { data, error } = await query.select(BOOKING_COLUMNS).maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (data) {
      const booking = toBooking(data as BookingRow);
      return { result: booking, siteId: booking.bookingCode ?? booking.id };
    }

    const existing = await getBooking(site, bookingId);

    if (!existing) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

    if (!['confirmed', 'completed'].includes(existing.status)) {
      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} is ${existing.status}`,
        `IDs can be recorded only for a confirmed stay. This one is ${existing.status}.`,
      );
    }

    // Already received or verified: nothing to change.
    return { result: existing, siteId: existing.bookingCode ?? existing.id };
  });
}

/** Guest details an edit may change (Ooruda Villa, edit booking Phase 1). */
export interface BookingGuestEdit {
  salutation: string;
  firstName: string;
  lastName: string;
  /** E.164 or empty; stored through `toSitePhone`. */
  guestPhone: string;
  guestEmail: string;
  adults: number;
  children: number;
  infants: number;
  specialRequests: string;
  /**
   * `updated_at` as the caller last saw it, for a compare-and-set. Empty
   * skips the check (the column is nullable on the site).
   */
  expectedUpdatedAt: string;
}

/**
 * Rewrites a booking's guest details on the site.
 *
 * Only who the guest is, how to reach them, how many of them there are and
 * what they asked for. Dates, money and status are untouched - a date change
 * needs the site's atomic availability check and a money change needs the
 * invoice rules, both of which are later phases.
 *
 * Restricted to a stay that is live or finished: `pending` holds lapse on
 * their own, and a `cancelled` or `expired` booking is a record of something
 * that did not happen, so its guest details are history rather than data.
 *
 * `guest_name` is written alongside the parts because the site keeps the
 * joined name as its own column, and every guest-facing surface (the booking
 * page, the site's admin, the confirmation email) reads that one. Letting it
 * drift from the parts is how a renamed guest keeps their old name.
 */
export async function updateBookingGuestDetails(
  site: VillaSite,
  bookingId: string,
  edit: BookingGuestEdit,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.update', actorUserId, async () => {
    const guestName = [edit.firstName.trim(), edit.lastName.trim()]
      .filter(Boolean)
      .join(' ');

    let query = site.client
      .from('bookings')
      .update({
        guest_salutation: edit.salutation.trim() || null,
        guest_first_name: edit.firstName.trim(),
        guest_last_name: edit.lastName.trim() || null,
        guest_name: guestName,
        guest_email: edit.guestEmail.trim(),
        guest_phone: toSitePhone(edit.guestPhone),
        num_adults: nonNegativeInt(edit.adults, 'adults'),
        num_children: nonNegativeInt(edit.children, 'children'),
        num_infants: nonNegativeInt(edit.infants, 'infants'),
        special_requests: edit.specialRequests.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .in('status', [...EDITABLE_BOOKING_STATUSES]);

    // Compare-and-set on the timestamp the caller last saw. This is the only
    // thing standing between a full-field form and a lost update: two
    // operators with the page open would otherwise each write all nine
    // fields, and the later save would silently revert the earlier one.
    if (edit.expectedUpdatedAt) {
      query = query.eq('updated_at', edit.expectedUpdatedAt);
    }

    const { data, error } = await query.select(BOOKING_COLUMNS).maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (data) {
      const booking = toBooking(data as BookingRow);
      return { result: booking, siteId: booking.bookingCode ?? booking.id };
    }

    // Nothing matched. Re-read to say which of the three reasons it was,
    // rather than reporting a live booking as missing.
    const existing = await getBooking(site, bookingId);

    if (!existing) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

    if (
      !EDITABLE_BOOKING_STATUSES.includes(
        existing.status as (typeof EDITABLE_BOOKING_STATUSES)[number],
      )
    ) {
      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} is ${existing.status}`,
        `Only a confirmed or completed booking can be edited. This one is ${existing.status}.`,
      );
    }

    throw new VillaDbError(
      'CONFLICT',
      `booking ${bookingId} changed during edit`,
      'Someone else changed this booking while you were editing it. Close this and open it again to see their change before you re-apply yours.',
    );
  });
}

export interface SitePayment {
  id: string;
  amountPaise: number;
  status: string;
  razorpayPaymentId: string | null;
  createdAt: string | null;
}

/**
 * Website (Razorpay) payments for one booking of this property.
 *
 * Payments carry no property_id, so the booking is what scopes them to this
 * villa. Callers that already hold the booking (the booking page does) pass
 * `verified: true` to say so, which saves re-reading the same row from the
 * booking site; anyone passing a bare id still gets it checked here.
 */
export async function listSitePayments(
  site: VillaSite,
  bookingId: string,
  options: { verified?: boolean } = {},
): Promise<SitePayment[]> {
  if (!options.verified) {
    const booking = await getBooking(site, bookingId);

    if (!booking) return [];
  }

  const { data, error } = await site.client
    .from('payments')
    .select('id, amount, status, razorpay_payment_id, created_at')
    .eq('booking_id', bookingId)
    .order('created_at');

  if (error) throw fromSiteError(error);

  return (data ?? []).map((p) => ({
    id: p.id,
    amountPaise: Number(p.amount),
    status: p.status ?? 'created',
    razorpayPaymentId: p.razorpay_payment_id,
    createdAt: p.created_at,
  }));
}

/**
 * Sets the booking's payment_status on the site (what the guest's booking
 * page shows). Callers pass sitePaymentStatus(...) from lib/villa/ledger,
 * which holds back 'paid' until villa-booking TODO 8c.
 */
export async function setPaymentStatus(
  site: VillaSite,
  bookingId: string,
  status: 'unpaid' | 'partially_paid' | 'paid' | 'refunded',
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(
    site,
    `booking.payment_${status}`,
    actorUserId,
    async () => {
      const { data, error } = await site.client
        .from('bookings')
        .update({
          payment_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('property_id', site.sitePropertyId)
        .select(BOOKING_COLUMNS)
        .maybeSingle();

      if (error) throw fromSiteWriteError(error);
      if (!data) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

      const booking = toBooking(data as BookingRow);
      // The list view renders payment_status as a badge, so the cached list
      // must drop when it changes (as cancel/complete/reopen already do).
      invalidateBookingsViewCache(site.sitePropertyId);
      return { result: booking, siteId: booking.bookingCode ?? booking.id };
    },
  );
}

/**
 * Undoes a check-out pressed by mistake (or for a guest who stayed on):
 * completed → confirmed. Refused once the site has issued an invoice for it.
 */
export async function reopenStay(
  site: VillaSite,
  bookingId: string,
  actorUserId: string | null,
): Promise<SiteBooking> {
  return withSyncLog(site, 'booking.reopen', actorUserId, async () => {
    const { data, error } = await site.client
      .from('bookings')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('property_id', site.sitePropertyId)
      .eq('status', 'completed')
      .is('invoice_number', null)
      .select(BOOKING_COLUMNS)
      .maybeSingle();

    if (error) throw fromSiteWriteError(error);

    if (!data) {
      const existing = await getBooking(site, bookingId);

      if (!existing)
        throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} is ${existing.status}, invoice ${existing.invoiceNumber ?? 'none'}`,
        existing.invoiceNumber
          ? 'An invoice has been issued for this stay, so the check-out cannot be undone.'
          : 'Only a checked-out stay can be reopened.',
      );
    }

    const booking = toBooking(data as BookingRow);
    invalidateBookingsViewCache(site.sitePropertyId);
    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
}

/**
 * The guest's own confirmation page key on the booking site.
 *
 * Deliberately not part of SiteBooking: that object is handed to client
 * components on the booking screen, and this token is the only credential
 * that opens /booking/<token>. It is read on its own, server-side, by the one
 * caller that puts it in an email to the guest it belongs to.
 */
export async function getBookingAccessToken(
  site: VillaSite,
  bookingId: string,
): Promise<string | null> {
  const { data, error } = await site.client
    .from('bookings')
    .select('access_token')
    .eq('property_id', site.sitePropertyId)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw fromSiteError(error);

  return data?.access_token ?? null;
}

/** "Mangalore, Karnataka" - the locality line under the villa's name. */
export async function getPropertyLocation(
  site: VillaSite,
): Promise<string | null> {
  const { data, error } = await site.client
    .from('properties')
    .select('city, state')
    .eq('id', site.sitePropertyId)
    .maybeSingle();

  if (error) throw fromSiteError(error);
  if (!data) return null;

  const line = [data.city, data.state].filter(Boolean).join(', ');

  return line || null;
}

/** The villa's postal address, as the booking site lists it. */
export async function getPropertyAddress(
  site: VillaSite,
): Promise<string | null> {
  const { data, error } = await site.client
    .from('properties')
    .select('address, city, state, pincode')
    .eq('id', site.sitePropertyId)
    .maybeSingle();

  if (error) throw fromSiteError(error);
  if (!data) return null;

  const tail = [data.city, data.state].filter(Boolean).join(', ');
  return [
    data.address,
    tail && data.pincode ? `${tail} ${data.pincode}` : tail || data.pincode,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Re-points an enriched booking at the channel's new UID for the same stay.
 *
 * Airbnb reissues a UID whenever an event changes, so a stay nobody touched
 * in Ooruda can come back under a new key (villa-booking 00102). The pairing
 * is recovered from the dates (lib/villa/channel-link), and this writes the
 * recovery down so the next read matches on the UID again.
 *
 * Scoped to the same feed on purpose: a repair must never move a booking from
 * one channel to another.
 */
export async function relinkChannelBooking(
  site: VillaSite,
  bookingId: string,
  link: { feedId: string; externalUid: string },
): Promise<boolean> {
  const { data, error } = await site.client
    .from('bookings')
    .update({ source_external_uid: link.externalUid })
    .eq('id', bookingId)
    .eq('property_id', site.sitePropertyId)
    .eq('source_feed_id', link.feedId)
    .select('id');

  if (error) throw fromSiteWriteError(error);

  if ((data ?? []).length > 0) {
    invalidateBookingsViewCache(site.sitePropertyId);
    return true;
  }

  return false;
}

/**
 * The booking that fulfils one channel event, or null. Read before enriching
 * a stay, so a second attempt reports "already recorded" rather than being
 * refused as a double booking.
 *
 * A live booking wins over a cancelled one. Only live rows are unique per
 * event (villa-booking 00108), because a stay cancelled by mistake has to be
 * recordable again; so there may be several cancelled rows and at most one
 * live one, and the caller cares about the live one.
 */
export async function getChannelLinkedBooking(
  site: VillaSite,
  link: { feedId: string; externalUid: string },
): Promise<SiteBooking | null> {
  const { data, error } = await site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('property_id', site.sitePropertyId)
    .eq('source_feed_id', link.feedId)
    .eq('source_external_uid', link.externalUid)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw fromSiteError(error);

  const rows = (data ?? []).map((row) => toBooking(row as BookingRow));

  return rows.find((b) => b.status !== 'cancelled') ?? rows[0] ?? null;
}

/**
 * Channel-linked bookings still holding nights.
 *
 * `window` must be the SAME range the caller read its blocks over. Pairing a
 * windowed block list against a differently-windowed booking list reports
 * nonsense both ways: a stay outside the booking window looks un-recorded
 * (so a screen offers to record it again), and a booking outside the block
 * window looks dropped by the channel. Without a window this answers "from
 * today onwards", which is what the post-sync link repair wants.
 */
export async function listChannelLinkedBookings(
  site: VillaSite,
  window?: { from: string; to: string },
): Promise<SiteBooking[]> {
  let query = site.client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('property_id', site.sitePropertyId)
    .not('source_feed_id', 'is', null)
    .in('status', ['pending', 'confirmed', 'completed']);

  query = window
    ? query.lt('check_in', window.to).gt('check_out', window.from)
    : query.gte('check_out', todayIst());

  const { data, error } = await query.order('check_in');

  if (error) throw fromSiteError(error);

  return (data ?? []).map((row) => toBooking(row as BookingRow));
}

/**
 * Takes the channel link off a booking that never got confirmed.
 *
 * `createOfflineBooking` creates the row inside the site's lock and confirms
 * it in a second statement; if that second step fails the row is left
 * `pending`, which no list view shows and which no hold keeps alive. Without
 * this it would still own the channel event's link for ever, and the stay
 * could never be recorded again. Scoped to pending rows, so a confirmed
 * booking can never be unlinked by accident.
 */
export async function clearChannelLink(
  site: VillaSite,
  link: { feedId: string; externalUid: string },
): Promise<void> {
  const { error } = await site.client
    .from('bookings')
    .update({ source_feed_id: null, source_external_uid: null })
    .eq('property_id', site.sitePropertyId)
    .eq('source_feed_id', link.feedId)
    .eq('source_external_uid', link.externalUid)
    .eq('status', 'pending');

  if (error) throw fromSiteWriteError(error);
}
