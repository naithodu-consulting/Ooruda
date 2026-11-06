/**
 * Villa values that mirror database/site check constraints. No UI here:
 * both the booking-site connector and the screens import these.
 */

/** Channels Ooruda records for bookings it takes (the site writes 'online'). */
export const OFFLINE_CHANNEL_VALUES = [
  'phone',
  'whatsapp',
  'referral',
  'instagram',
  'manual',
  'other',
] as const;

export type OfflineChannel = (typeof OFFLINE_CHANNEL_VALUES)[number];

/**
 * Channels that sold the stay themselves. Ooruda records one of these only
 * when an operator enriches a stay imported from that channel's calendar
 * feed, never as a free choice in the booking form (villa-booking 00108).
 */
export const CHANNEL_SOLD_CHANNEL_VALUES = ['airbnb', 'channel'] as const;

export type ChannelSoldChannel = (typeof CHANNEL_SOLD_CHANNEL_VALUES)[number];
export type BookingChannel = OfflineChannel | ChannelSoldChannel | 'online';

/**
 * Payment states a NEW offline booking may start in. 'paid' is left out on
 * purpose: on the booking site today, confirmed + paid immediately issues a
 * GST invoice number, but invoices are issued at check-out (plan decision 20;
 * villa-booking TODO 8c moves the site's trigger). Full payment is recorded
 * later.
 */
export const NEW_BOOKING_PAYMENT_STATUSES = [
  'unpaid',
  'partially_paid',
  'paid',
] as const;

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded';

/**
 * Bookings whose guest details may be corrected.
 *
 * `completed` is deliberately included: a misspelt name is usually found when
 * the invoice or the police verification is written, which is after the stay.
 * A `pending` hold lapses on its own, and a `cancelled` or `expired` booking
 * is a record of something that did not happen.
 *
 * The load-bearing copy is the site `UPDATE`'s own `.in('status', …)`, which
 * applies it atomically; the service and the page read this to fail early and
 * to decide whether to offer the button at all.
 */
export const EDITABLE_BOOKING_STATUSES = ['confirmed', 'completed'] as const;
export type IdStatus = 'pending' | 'received' | 'verified';
/**
 * `villa_booking_activity.note`'s own limit
 * (`note is null or length(note) <= 1000`, villa_m3a_bookings).
 */
export const MAX_ACTIVITY_NOTE = 1000;

/**
 * Every booking-activity action, as ONE list.
 *
 * The same values live in the `villa_booking_activity_action_check`
 * constraint, and `activity.test.ts` asserts the two agree. They used to be
 * maintained separately in three places, and the failure mode was quiet: an
 * action added here but not to the constraint fails the insert with 23514,
 * which `recordBookingActivity` swallows into `auditWritten: false` - a money
 * change applied with no audit trail, surfaced only as a dismissable toast.
 */
export const BOOKING_ACTIVITY_ACTIONS = [
  'created',
  'cancelled',
  'completed',
  'reopened',
  'checked_in',
  'booking_updated',
  'amount_adjusted',
  'dates_changed',
  'enrichment_voided',
  'note',
  'payment_recorded',
  'payment_voided',
  'refund_recorded',
  'id_recorded',
  'id_verified',
  'id_deleted',
  'email_sent',
  'guest_added',
  'guest_removed',
] as const;

export type BookingActivityAction = (typeof BOOKING_ACTIVITY_ACTIONS)[number];

/**
 * Block reasons offered on the calendar. The site also accepts
 * 'offline_booking', but guests taken by phone are recorded as bookings (so
 * they count in revenue and occupancy), never as blocks.
 */
export const OPERATOR_BLOCK_REASONS = [
  'maintenance',
  'owner_hold',
  'direct_enquiry',
] as const;

export type OperatorBlockReason = (typeof OPERATOR_BLOCK_REASONS)[number];
