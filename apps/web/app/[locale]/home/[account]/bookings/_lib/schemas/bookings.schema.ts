import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

import {
  NEW_BOOKING_PAYMENT_STATUSES,
  OFFLINE_CHANNEL_VALUES,
} from '~/lib/villa/constants';

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
  guestEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, {
      message: 'Enter a valid email, or leave it empty',
    }),
  channel: z.enum(OFFLINE_CHANNEL_VALUES),
  paymentStatus: z.enum(NEW_BOOKING_PAYMENT_STATUSES),
  specialRequests: z.string().trim().max(1000),
  isEvent: z.boolean(),
};

/** What the new-booking form collects. */
export const NewBookingFormSchema = z
  .object(bookingFields)
  .refine(checkOutAfterCheckIn, checkOutMessage);

export type NewBookingInput = z.input<typeof NewBookingFormSchema>;

/**
 * What the server action accepts: the form plus the total the user was
 * quoted (paise). The server prices the stay itself and only COMPARES this,
 * so a price change between quote and confirm is caught, never trusted.
 */
export const NewBookingSchema = z
  .object({ ...bookingFields, expectedTotalPaise: z.number().int().positive() })
  .refine(checkOutAfterCheckIn, checkOutMessage);

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
  template: z.enum(['pre_arrival', 'thank_you']),
});
