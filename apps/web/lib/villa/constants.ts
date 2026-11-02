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
export type IdStatus = 'pending' | 'received' | 'verified';
export type BookingActivityAction =
  | 'created'
  | 'cancelled'
  | 'completed'
  | 'reopened'
  | 'note'
  | 'payment_recorded'
  | 'payment_voided'
  | 'refund_recorded'
  | 'id_recorded'
  | 'id_verified'
  | 'id_deleted'
  | 'email_sent'
  | 'guest_added'
  | 'guest_removed';

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
