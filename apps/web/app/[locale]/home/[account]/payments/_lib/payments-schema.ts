import * as z from 'zod';

export const PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Card',
  'NetBanking',
  'Wallet',
  'NEFT',
  'Razorpay',
] as const;

export const RecordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  mode: z.enum(PAYMENT_MODES),
  paid_by_role: z.enum(['Owner', 'Tenant']),
});

export type RecordPaymentInput = z.input<typeof RecordPaymentSchema>;
