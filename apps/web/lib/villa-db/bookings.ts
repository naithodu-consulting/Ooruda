import 'server-only';
import { OFFLINE_CHANNEL_VALUES } from '~/lib/villa/constants';
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

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export interface NewOfflineBooking {
  guestName: string;
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
  channel: OfflineChannel;
  paymentStatus: PaymentStatus;
}

export interface SiteBooking {
  id: string;
  bookingCode: string | null;
  referenceNumber: string;
  status: string;
  paymentStatus: string;
  channel: string | null;
  guestName: string;
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
  updatedAt: string | null;
}

const BOOKING_COLUMNS =
  'id, booking_code, reference_number, status, payment_status, booking_channel, guest_name, guest_email, guest_phone, check_in, check_out, num_nights, num_adults, num_children, num_infants, base_amount, extra_guest_amount, tax_amount, total_amount, discount_amount, discount_code, id_status, invoice_number, updated_at';

type BookingRow = {
  id: string;
  booking_code: string | null;
  reference_number: string;
  status: string | null;
  payment_status: string | null;
  booking_channel: string | null;
  guest_name: string;
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
  updated_at: string | null;
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
    updatedAt: row.updated_at,
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

  if (!OFFLINE_CHANNELS.includes(input.channel)) {
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

  return (data ?? []).map((row) => toBooking(row as BookingRow));
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

export interface SitePayment {
  id: string;
  amountPaise: number;
  status: string;
  razorpayPaymentId: string | null;
  createdAt: string | null;
}

/** Website (Razorpay) payments for one booking of this property. */
export async function listSitePayments(
  site: VillaSite,
  bookingId: string,
): Promise<SitePayment[]> {
  // Scope through the booking: payments carry no property_id.
  const booking = await getBooking(site, bookingId);

  if (!booking) return [];

  const { data, error } = await site.client
    .from('payments')
    .select('id, amount, status, razorpay_payment_id, created_at')
    .eq('booking_id', booking.id)
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
    return { result: booking, siteId: booking.bookingCode ?? booking.id };
  });
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
