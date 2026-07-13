import * as z from 'zod';

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const GenerateBillsSchema = z.object({
  period: z
    .string()
    .regex(PERIOD_REGEX, "Use the 'YYYY-MM' format, e.g. 2026-06"),
  billType: z.enum(['All', 'Maintenance', 'Electricity', 'Other Charges'], {
    error: 'Please select a bill type.',
  }),
});

export type GenerateBillsInput = z.input<typeof GenerateBillsSchema>;
