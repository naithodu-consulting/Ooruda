import 'server-only';
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
export const OFFLINE_CHANNELS = [
  'whatsapp',
  'phone',
  'referral',
  'instagram',
  'manual',
  'other',
] as const;

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
  idStatus: string;
  invoiceNumber: string | null;
  updatedAt: string | null;
}

const BOOKING_COLUMNS =
  'id, booking_code, reference_number, status, payment_status, booking_channel, guest_name, guest_email, guest_phone, check_in, check_out, num_nights, num_adults, num_children, num_infants, base_amount, extra_guest_amount, tax_amount, total_amount, id_status, invoice_number, updated_at';

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
    idStatus: row.id_status ?? 'pending',
    invoiceNumber: row.invoice_number,
    updatedAt: row.updated_at,
  };
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
        p_guest_phone: input.guestPhone?.trim() ?? '',
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
 * Cancels a pending or confirmed booking. The dates are free immediately.
 * Refunds are handled separately (plan §9b) — this only changes status.
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
      .in('status', ['pending', 'confirmed'])
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
