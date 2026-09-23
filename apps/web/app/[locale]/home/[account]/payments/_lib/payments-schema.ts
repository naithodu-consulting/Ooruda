import * as z from 'zod';

import { todayInBillingZone } from '~/lib/billing-dates';

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
  // Free-text reference for bookkeeping (UPI ID, cheque no., UTR, etc.)
  // Hidden and ignored for Razorpay payments (gateway provides its own ID).
  reference_no: z.string().max(100).optional(),
  // Date the money actually changed hands, which is not necessarily the day
  // it was entered - cash handed to an admin is often recorded days later.
  // 'YYYY-MM-DD' in the billing timezone; blank means "now".
  paid_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .refine((d) => d <= todayInBillingZone(), {
      message: 'Payment date cannot be in the future.',
    })
    .optional(),
});

export type RecordPaymentInput = z.input<typeof RecordPaymentSchema>;
