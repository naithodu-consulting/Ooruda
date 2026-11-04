import * as z from 'zod';

import { isPhoneEmpty, normalizePhoneNumber } from '@kit/shared/utils';

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

export const SALUTATIONS = ['Mr', 'Mrs', 'Ms'] as const;
export type Salutation = (typeof SALUTATIONS)[number];

const bookingFields = {
  ...stayFields,
  infants: guests,
  salutation: z.enum(SALUTATIONS, {
    message: 'Select a salutation',
  }),
  firstName: z.string().trim().min(1, { message: 'Enter first name' }).max(120),
  lastName: z.string().trim().max(120).optional().default(''),
  guestPhone: z
    .string()
    .trim()
    .min(1, { message: 'Enter a phone number' })
    .max(25)
    .refine((v) => !isPhoneEmpty(v) && normalizePhoneNumber(v) !== null, {
      message:
        'Enter a valid phone number (10-digit mobile or international with country code)',
    }),
  // Required: the confirmation email is the guest's only record of a booking
  // taken by phone or message. It is held back until a payment is recorded
  // (lib/villa/booking-payments.ts), so the address is still required for a
  // booking that has not paid yet: staff send it from the booking page once
  // the advance is recorded.
  guestEmail: z
    .string()
    .trim()
    .min(1, { message: 'Enter the guest email address' })
    .max(200)
    .refine((v) => z.string().email().safeParse(v).success, {
      message: 'Enter a valid email address (e.g. name@example.com)',
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
  isSpecialPrice: z.boolean().default(false),
  specialBaseAmount: z.coerce
    .number()
    .min(0)
    .max(10_000_000)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: 'Use at most 2 decimals',
    })
    .optional(),
  specialGstAmount: z.coerce
    .number()
    .min(0)
    .max(10_000_000)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: 'Use at most 2 decimals',
    })
    .optional()
    .default(0),
};

function specialPriceCheck(v: {
  isSpecialPrice?: boolean;
  specialBaseAmount?: number;
}) {
  if (v.isSpecialPrice) {
    return typeof v.specialBaseAmount === 'number' && v.specialBaseAmount > 0;
  }
  return true;
}

/** What the new-booking form collects. */
export const NewBookingFormSchema = z
  .object(bookingFields)
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine(advanceWhenHasPaid, advanceMessage)
  .refine(specialPriceCheck, {
    message: 'Enter preferential base amount',
    path: ['specialBaseAmount'],
  });

export type NewBookingInput = z.input<typeof NewBookingFormSchema>;

/**
 * What the server action accepts: the form plus the total the user was
 * quoted (paise). The server prices the stay itself and only COMPARES this,
 * so a price change between quote and confirm is caught, never trusted.
 */
export const NewBookingSchema = z
  .object({ ...bookingFields, expectedTotalPaise: z.number().int().positive() })
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine(advanceWhenHasPaid, advanceMessage)
  .refine(specialPriceCheck, {
    message: 'Enter preferential base amount',
    path: ['specialBaseAmount'],
  });

function enrichAmountCheck(v: { baseAmount?: number; totalAmount?: number }) {
  return (
    (typeof v.baseAmount === 'number' && v.baseAmount > 0) ||
    (typeof v.totalAmount === 'number' && v.totalAmount > 0)
  );
}

/**
 * Guest and money details for a stay a booking channel sold, attached to the
 * imported block that holds its nights (villa-booking 00108).
 *
 * Deliberately NOT the new-booking schema:
 *   - the dates come from the feed, not the operator, so they are not priced
 *     against the rate card;
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
    salutation: z.enum(SALUTATIONS, {
      message: 'Select a salutation',
    }),
    firstName: z
      .string()
      .trim()
      .min(1, { message: 'Enter first name' })
      .max(120),
    lastName: z.string().trim().max(120).optional().default(''),
    guestPhone: z
      .string()
      .trim()
      .max(25)
      .refine((v) => isPhoneEmpty(v) || normalizePhoneNumber(v) !== null, {
        message:
          'Enter a valid phone number (10-digit mobile or international with country code)',
      }),
    guestEmail: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === '' || z.string().email().safeParse(v).success, {
        message: 'Enter a valid email address (e.g. name@example.com)',
      }),
    adults: z.coerce
      .number()
      .int()
      .min(1, { message: 'At least one adult' })
      .max(100),
    children: guests,
    infants: guests,
    /** Base total / stay tariff charged to the guest, in rupees. */
    baseAmount: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.coerce
        .number()
        .positive({ message: 'Enter base total' })
        .max(10_000_000)
        .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
          message: 'Use at most 2 decimals',
        })
        .optional(),
    ),
    /** GST charged to the guest, in rupees. */
    gstAmount: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? 0 : v),
      z.coerce
        .number()
        .min(0, { message: 'GST cannot be negative' })
        .max(10_000_000)
        .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
          message: 'Use at most 2 decimals',
        })
        .optional()
        .default(0),
    ),
    /** Total amount charged to the guest, in rupees. */
    totalAmount: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.coerce
        .number()
        .positive({ message: 'Enter the amount charged' })
        .max(10_000_000)
        .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
          message: 'Use at most 2 decimals',
        })
        .optional(),
    ),
    /** Airbnb commission / charges deducted from host payout, in rupees. */
    airbnbCharges: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? 0 : v),
      z.coerce
        .number()
        .min(0, { message: 'Airbnb charges cannot be negative' })
        .max(10_000_000)
        .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
          message: 'Use at most 2 decimals',
        })
        .optional()
        .default(0),
    ),
    specialRequests: z.string().trim().max(1000),
  })
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine(enrichAmountCheck, {
    message: 'Enter base total',
    path: ['baseAmount'],
  });

export type EnrichChannelStayInput = z.input<typeof EnrichChannelStaySchema>;

/**
 * Editing an existing booking's guest details (Phase 1).
 *
 * Deliberately NOT the new-booking schema:
 *   - no dates and no money: a date change needs the site's atomic
 *     availability check and a price change needs the invoice rules, which
 *     are Phases 3 and 2;
 *   - phone and email are optional, because a stay a channel sold often has
 *     neither (Airbnb owns the guest conversation) and an edit must not force
 *     staff to invent one to fix a spelling. Both are still validated when
 *     given, and a direct booking that already has them keeps them unless
 *     deliberately cleared;
 *   - a reason is required. The whole point of the entry in
 *     `villa_booking_activity` is answering "who changed what, and why",
 *     months later, over a GST invoice or a police verification.
 */
export const UpdateBookingSchema = z.object({
  ...ids,
  bookingId: z.string().uuid(),
  /**
   * `bookings.updated_at` as the page rendered it, for a compare-and-set on
   * the write. Without it this form is a full-field overwrite from a possibly
   * stale render, so a second operator's change is silently reverted - and
   * the activity log records the revert as if it were intended. Optional only
   * because the column is nullable on the site; a booking with no timestamp
   * cannot be checked and is written as before.
   */
  siteUpdatedAt: z.string().trim().max(40).optional().default(''),
  /**
   * Not `z.enum(SALUTATIONS)`: the site's own checkout, its admin and imports
   * can hold 'Dr', 'Miss', 'Shri' or anything else, and forcing the form's
   * three values would re-title a guest on their invoice as a side effect of
   * fixing a phone number. The service accepts an off-list value only when it
   * is the one already stored, so this cannot be used to write a new one.
   */
  salutation: z.string().trim().max(40),
  firstName: z.string().trim().min(1, { message: 'Enter first name' }).max(120),
  lastName: z.string().trim().max(120).optional().default(''),
  guestPhone: z
    .string()
    .trim()
    .max(25)
    .refine((v) => isPhoneEmpty(v) || normalizePhoneNumber(v) !== null, {
      message:
        'Enter a valid phone number (10-digit mobile or international with country code)',
    }),
  guestEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, {
      message: 'Enter a valid email address (e.g. name@example.com)',
    }),
  adults: z.coerce
    .number()
    .int()
    .min(1, { message: 'At least one adult' })
    .max(100),
  children: guests,
  infants: guests,
  specialRequests: z.string().trim().max(1000),
  reason: z
    .string()
    .trim()
    .min(3, { message: 'Say why this booking is being changed' })
    .max(500),
});

export type UpdateBookingInput = z.input<typeof UpdateBookingSchema>;

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

export const CheckInStaySchema = CompleteStaySchema;

export const ReopenStaySchema = CompleteStaySchema;

export const SendGuestEmailSchema = z.object({
  ...ids,
  bookingId: z.string().uuid(),
  template: z.enum(['booking_confirmation', 'pre_arrival', 'thank_you']),
});
