import * as z from 'zod';

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const GenerateBillsSchema = z.object({
  period: z
    .string()
    .regex(PERIOD_REGEX, "Use the 'YYYY-MM' format, e.g. 2026-06"),
  billType: z.enum(
    ['All', 'Maintenance', 'Electricity', 'Other Charges', 'Sinking Fund'],
    {
      error: 'Please select a bill type.',
    },
  ),
});

export type GenerateBillsInput = z.input<typeof GenerateBillsSchema>;

export const VoidBillSchema = z.object({
  billId: z.string().uuid(),
  reason: z
    .string()
    .min(1, 'Please enter a reason for cancelling this bill.')
    .max(500),
});

export type VoidBillInput = z.input<typeof VoidBillSchema>;

export const VoidBillsBulkSchema = z.object({
  period: z
    .string()
    .regex(PERIOD_REGEX, "Use the 'YYYY-MM' format, e.g. 2026-06"),
  billType: z.enum([
    'all',
    'maintenance',
    'electricity',
    'other_charges',
    'sinking_fund',
  ]),
  reason: z
    .string()
    .min(1, 'Please enter a reason for cancelling these bills.')
    .max(500),
});

export type VoidBillsBulkInput = z.input<typeof VoidBillsBulkSchema>;
