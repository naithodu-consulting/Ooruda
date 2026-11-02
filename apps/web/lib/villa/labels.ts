/**
 * Villa vocabulary shared by settings, bookings (M3) and invoices (M5).
 * The values mirror database check constraints; labels are what people read.
 */
import { parseChannelNote } from './channel-note';

export const ADDON_UNITS = [
  'per_stay',
  'per_night',
  'per_guest_per_night',
  'per_unit',
] as const;

export type AddonUnit = (typeof ADDON_UNITS)[number];

export const ADDON_UNIT_LABELS: Record<AddonUnit, string> = {
  per_stay: 'per stay',
  per_night: 'per night',
  per_guest_per_night: 'per guest per night',
  per_unit: 'each',
};

export function addonUnitLabel(unit: string): string {
  return ADDON_UNIT_LABELS[unit as AddonUnit] ?? unit;
}

export const CONTACT_CATEGORIES = [
  'caretaker',
  'manager',
  'owner',
  'security',
  'doctor',
  'hospital',
  'ambulance',
  'police',
  'fire',
  'electrician',
  'plumber',
  'other',
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  caretaker: 'Caretaker',
  manager: 'Manager',
  owner: 'Owner',
  security: 'Security',
  doctor: 'Doctor',
  hospital: 'Hospital',
  ambulance: 'Ambulance',
  police: 'Police',
  fire: 'Fire',
  electrician: 'Electrician',
  plumber: 'Plumber',
  other: 'Other',
};

export function contactCategoryLabel(category: string): string {
  return CONTACT_CATEGORY_LABELS[category as ContactCategory] ?? category;
}

import type {
  BookingActivityAction,
  BookingChannel,
  BookingStatus,
  IdStatus,
  PaymentStatus,
} from './constants';

export { OFFLINE_CHANNEL_VALUES } from './constants';

export const BOOKING_CHANNEL_LABELS: Record<BookingChannel, string> = {
  online: 'Website',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  instagram: 'Instagram',
  manual: 'Walk-in / manual',
  other: 'Other',
  airbnb: 'Airbnb',
  channel: 'Booking channel',
};

export function channelLabel(channel: string | null): string {
  return channel
    ? (BOOKING_CHANNEL_LABELS[channel as BookingChannel] ?? channel)
    : '-';
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partial payment',
  paid: 'Fully paid',
  refunded: 'Refunded',
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status;
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card (at the villa)',
  other: 'Other',
};

export function paymentModeLabel(mode: string): string {
  return PAYMENT_MODE_LABELS[mode] ?? mode;
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  completed: 'Checked out',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? status;
}

export const ID_STATUS_LABELS: Record<IdStatus, string> = {
  pending: 'ID pending',
  received: 'ID received',
  verified: 'ID verified',
};

export function idStatusLabel(status: string): string {
  return ID_STATUS_LABELS[status as IdStatus] ?? status;
}

export const ACTIVITY_LABELS: Record<BookingActivityAction, string> = {
  created: 'Booked',
  cancelled: 'Cancelled',
  completed: 'Checked out',
  reopened: 'Check-out undone',
  note: 'Note',
  payment_recorded: 'Payment recorded',
  payment_voided: 'Payment voided',
  refund_recorded: 'Refund recorded',
  id_recorded: 'ID recorded',
  id_verified: 'ID verified',
  id_deleted: 'ID deleted',
  email_sent: 'Email sent',
  guest_added: 'Guest added',
  guest_removed: 'Guest removed',
};

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action as BookingActivityAction] ?? action;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "6 guests + 1 infant" (infants are not guests: they don't count or pay). */
export function formatGuests(b: {
  adults: number;
  children: number;
  infants: number;
}): string {
  const main = plural(b.adults + b.children, 'guest', 'guests');
  return b.infants
    ? `${main} + ${plural(b.infants, 'infant', 'infants')}`
    : main;
}

export function formatNights(n: number): string {
  return plural(n, 'night', 'nights');
}

export const BLOCK_REASON_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  owner_hold: "Owner's own use",
  direct_enquiry: 'Direct enquiry',
  offline_booking: 'Offline booking',
};

export function blockReasonLabel(reason: string | null): string {
  return reason ? (BLOCK_REASON_LABELS[reason] ?? reason) : 'Blocked';
}

/**
 * What a blocked stretch of nights is called on screen.
 *
 * An imported block carries the reason `offline_booking` whatever channel it
 * came from (the site stamps it in `apply_ical_feed`), so the reason alone
 * labels an Airbnb stay "Offline booking". For a channel block the channel's
 * own name is the only honest label.
 */
export function blockLabel(block: {
  reason: string | null;
  source: 'manual' | 'ical';
  channelName?: string | null;
  notes?: string | null;
}): string {
  if (block.source !== 'ical') return blockReasonLabel(block.reason);

  const channel = block.channelName ?? 'Channel';

  // A hold the host made on the channel is not a guest booking, and calling
  // it one sends the operator hunting for a reservation that never existed.
  return parseChannelNote(block.notes ?? null).isChannelBlock
    ? `Blocked on ${channel}`
    : `${channel} booking`;
}
