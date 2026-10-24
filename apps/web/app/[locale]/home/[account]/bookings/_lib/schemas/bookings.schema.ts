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

const stayFields = {
  ...ids,
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

/** "Part paid" has to say how much, or the guest's email cannot state it. */
const advanceWhenPartPaid = (v: {
  paymentStatus: string;
  amountReceived: number;
}) => v.paymentStatus !== 'partially_paid' || v.amountReceived > 0;

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
  // taken by phone or message.
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
  .refine(advanceWhenPartPaid, advanceMessage);

export type NewBookingInput = z.input<typeof NewBookingFormSchema>;

/**
 * What the server action accepts: the form plus the total the user was
 * quoted (paise). The server prices the stay itself and only COMPARES this,
 * so a price change between quote and confirm is caught, never trusted.
 */
export const NewBookingSchema = z
  .object({ ...bookingFields, expectedTotalPaise: z.number().int().positive() })
  .refine(checkOutAfterCheckIn, checkOutMessage)
  .refine(advanceWhenPartPaid, advanceMessage);

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
