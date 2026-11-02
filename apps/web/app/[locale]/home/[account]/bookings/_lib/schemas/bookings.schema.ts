import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

import {
  NEW_BOOKING_PAYMENT_STATUSES,
  OFFLINE_CHANNEL_VALUES,
} from '~/lib/villa/constants';

import { PAYMENT_MODES } from './payments.schema';

const ids = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' });

const guests = z.coerce.number().int().min(0).max(100);

/**
 * Set by a villa admin who has confirmed they want a booking recorded past the
 * property's booking cutoff. The server honours it only for villa_admin, and
 * it skips the cutoff alone — never the occupancy check.
 */
const overrideCutoff = z.boolean().default(false);

const stayFields = {
  ...ids,
  overrideCutoff,
  checkIn: ymd,
  checkOut: ymd,
  adults: z.coerce
    .number()
    .int()
    .min(1, { message: 'At least one adult' })
    .max(100),
  children: guests,
};

const checkOutAfterCheckIn = (v: { checkIn: string; checkOut: string }) =>
  v.checkOut > v.checkIn;

const checkOutMessage = {
  message: 'Check-out must be after check-in',
  path: ['checkOut'],
};

/** Partial or full payment at time of booking needs the amount recorded. */
const advanceWhenHasPaid = (v: {
  paymentStatus: string;
  amountReceived: number;
}) =>
  (v.paymentStatus !== 'partially_paid' && v.paymentStatus !== 'paid') ||
  v.amountReceived > 0;

const advanceMessage = {
  message: 'Enter the amount received',
  path: ['amountReceived'],
};

/** A stay to price and check: the quote route. */
export const StaySchema = z
  .object(stayFields)
  .refine(checkOutAfterCheckIn, checkOutMessage);

export type StayInput = z.input<typeof StaySchema>;

const bookingFields = {
  ...stayFields,
  infants: guests,
  guestName: z
    .string()
    .trim()
    .min(1, { message: 'Enter the guest name' })
    .max(120),
  guestPhone: z
    .string()
    .trim()
    .refine((v) => normalizePhoneNumber(v) !== null, {
      message: 'Enter a valid phone number',
    }),
  // Required: the confirmation email is the guest's only record of a booking
  // taken by phone or message. It is held back until a payment is recorded
  // (lib/villa/booking-payments.ts), so the address is still required for a
  // booking that has not paid yet: staff send it from the booking page once
  // the advance is recorded.
  guestEmail: z
    .string()
    .trim()
    .min(1, { message: 'Enter the guest email' })
    .max(200)
    .refine((v) => z.string().email().safeParse(v).success, {
      message: 'Enter a valid email',
    }),
  channel: z.enum(OFFLINE_CHANNEL_VALUES),
  paymentStatus: z.enum(NEW_BOOKING_PAYMENT_STATUSES),
  // The advance taken when the booking was agreed. Only read when
  // paymentStatus is 'partially_paid'; it becomes a receipt on the booking,
  // which is what the confirmation email quotes back to the guest.
  amountReceived: z.coerce
    .number()
    .min(0)
    .max(10_000_000)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: 'Use at most 2 decimals',
    }),
  paymentMode: z.enum(PAYMENT_MODES),
  paymentReference: z.string().trim().max(100),
  specialRequests: z.string().trim().max(1000),
  isEvent: z.boolean(),
};

/** What the new-booking form collects. */
export const NewBookingFormSchema = z
  .object(bookingFields)
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine(advanceWhenHasPaid, advanceMessage);

export type NewBookingInput = z.input<typeof NewBookingFormSchema>;

/**
 * What the server action accepts: the form plus the total the user was
 * quoted (paise). The server prices the stay itself and only COMPARES this,
 * so a price change between quote and confirm is caught, never trusted.
 */
export const NewBookingSchema = z
  .object({ ...bookingFields, expectedTotalPaise: z.number().int().positive() })
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine(advanceWhenHasPaid, advanceMessage);

/**
 * Guest and money details for a stay a booking channel sold, attached to the
 * imported block that holds its nights (villa-booking 00108).
 *
 * Deliberately NOT the new-booking schema:
 *   - the dates come from the feed, not the operator, so they are not priced
 *     against the rate card: what matters is what the channel paid out;
 *   - the guest email is optional, because Airbnb never gives us one and the
 *     channel owns the guest conversation;
 *   - there is no cutoff question: the stay has already been sold.
 */
export const EnrichChannelStaySchema = z
  .object({
    ...ids,
    // The channel event, by the key that survives a sync. Not the
    // blocked_dates row id: apply_ical_feed replaces those every time.
    feedId: z.string().uuid(),
    externalUid: z.string().trim().min(1).max(500),
    checkIn: ymd,
    checkOut: ymd,
    guestName: z
      .string()
      .trim()
      .min(1, { message: 'Enter the guest name' })
      .max(120),
    guestPhone: z
      .string()
      .trim()
      .max(20)
      .refine((v) => v === '' || normalizePhoneNumber(v) !== null, {
        message: 'Enter a valid phone number',
      }),
    guestEmail: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === '' || z.string().email().safeParse(v).success, {
        message: 'Enter a valid email',
      }),
    adults: z.coerce
      .number()
      .int()
      .min(1, { message: 'At least one adult' })
      .max(100),
    children: guests,
    infants: guests,
    /** What the channel pays out for the stay, in rupees, GST included. */
    payoutAmount: z.coerce
      .number()
      .positive({ message: 'Enter the amount earned' })
      .max(10_000_000)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
        message: 'Use at most 2 decimals',
      }),
    /**
     * GST inside that payout. Zero by default: on Indian stays the channel
     * normally collects and remits it, and Ooruda must not invent a tax
     * figure the operator's accountant has not agreed.
     */
    taxAmount: z.coerce
      .number()
      .min(0)
      .max(10_000_000)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
        message: 'Use at most 2 decimals',
      }),
    /** The payout has already reached the villa's account. */
    payoutReceived: z.boolean(),
    specialRequests: z.string().trim().max(1000),
  })
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine((v) => v.taxAmount <= v.payoutAmount, {
    message: 'GST cannot be more than the amount earned',
    path: ['taxAmount'],
  });

export type EnrichChannelStayInput = z.input<typeof EnrichChannelStaySchema>;

export const CancelBookingSchema = z.object({
  ...ids,
  bookingId: z.string().uuid(),
  reasonCode: z.string().regex(/^[a-z_]+$/, { message: 'Pick a reason' }),
  note: z.string().trim().max(1000),
});

export type CancelBookingInput = z.input<typeof CancelBookingSchema>;

export const CompleteStaySchema = z.object({
  ...ids,
  bookingId: z.string().uuid(),
});

export const ReopenStaySchema = CompleteStaySchema;

export const SendGuestEmailSchema = z.object({
  ...ids,
  bookingId: z.string().uuid(),
  template: z.enum(['booking_confirmation', 'pre_arrival', 'thank_you']),
});
