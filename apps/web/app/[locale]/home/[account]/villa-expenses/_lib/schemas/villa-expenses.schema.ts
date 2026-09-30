import * as z from 'zod';

export const EXPENSE_CATEGORIES = [
  'housekeeping',
  'laundry',
  'utilities',
  'repairs',
  'pool',
  'garden',
  'supplies',
  'food',
  'staff',
  'commission',
  'marketing',
  'taxes_fees',
  'insurance',
  'other',
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<
  (typeof EXPENSE_CATEGORIES)[number],
  string
> = {
  housekeeping: 'Housekeeping',
  laundry: 'Laundry',
  utilities: 'Electricity, water, gas',
  repairs: 'Repairs and maintenance',
  pool: 'Pool',
  garden: 'Garden',
  supplies: 'Supplies and toiletries',
  food: 'Food and kitchen',
  staff: 'Staff wages',
  commission: 'Commissions (OTA, agents)',
  marketing: 'Marketing',
  taxes_fees: 'Taxes, licences, fees',
  insurance: 'Insurance',
  other: 'Other',
};

export const EXPENSE_MODES = ['cash', 'upi', 'bank', 'card', 'other'] as const;

const money = (label: string) =>
  z.coerce
    .number({ error: `Enter ${label}` })
    .min(0)
    .max(10_000_000)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: 'Use at most 2 decimals',
    });

export const ExpenseSchema = z
  .object({
    accountId: z.string().uuid(),
    propertyId: z.string().uuid(),
    // present when editing
    id: z.string().uuid().or(z.literal('')),
    category: z.enum(EXPENSE_CATEGORIES),
    description: z
      .string()
      .trim()
      .min(1, { message: 'Say what it was for' })
      .max(200),
    vendor: z.string().trim().max(120),
    amount: money('the amount').refine((v) => v > 0, {
      message: 'Enter an amount above zero',
    }),
    gstAmount: money('the GST'),
    mode: z.enum(EXPENSE_MODES),
    spentOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' }),
    invoiceNo: z.string().trim().max(60),
    notes: z.string().trim().max(500),
  })
  .refine((v) => v.gstAmount <= v.amount, {
    message: 'GST cannot be more than the amount',
    path: ['gstAmount'],
  });

export type ExpenseInput = z.input<typeof ExpenseSchema>;

export const DeleteExpenseSchema = z.object({
  accountId: z.string().uuid(),
  id: z.string().uuid(),
});
