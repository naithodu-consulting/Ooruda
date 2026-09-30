import * as z from 'zod';

export const PAYMENT_MODES = ['cash', 'upi', 'bank', 'card', 'other'] as const;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' });

const rupees = z.coerce
  .number({ error: 'Enter an amount' })
  .positive({ message: 'Enter an amount above zero' })
  .max(10_000_000)
  // At most 2 decimals (paise), tolerant of float representation.
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'Use at most 2 decimals',
  });

const bookingRef = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
  bookingId: z.string().uuid(),
};

export const RecordPaymentSchema = z.object({
  ...bookingRef,
  // One per dialog: a repeated submit returns the first receipt.
  requestId: z.string().uuid(),
  mode: z.enum(PAYMENT_MODES),
  amount: rupees,
  paidOn: ymd,
  reference: z.string().trim().max(100),
  payerName: z.string().trim().max(120),
  note: z.string().trim().max(500),
});

export type RecordPaymentInput = z.input<typeof RecordPaymentSchema>;

export const VoidPaymentSchema = z.object({
  ...bookingRef,
  paymentId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, { message: 'Say why this receipt is void' })
    .max(300),
});

export type VoidPaymentInput = z.input<typeof VoidPaymentSchema>;

export const RecordRefundSchema = z.object({
  ...bookingRef,
  requestId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amount: rupees,
  mode: z.enum(PAYMENT_MODES),
  refundedOn: ymd,
  reference: z.string().trim().max(100),
  reason: z
    .string()
    .trim()
    .min(3, { message: 'Say why the money is going back' })
    .max(500),
});

export type RecordRefundInput = z.input<typeof RecordRefundSchema>;
