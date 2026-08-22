import * as z from 'zod';

export const AMC_CATEGORIES = [
  'Elevator/Lift',
  'Generator/DG Set',
  'Fire Safety & Suppression',
  'CCTV & Security Systems',
  'Water Treatment/STP',
  'Pest Control',
  'Garden & Landscaping',
  'Electrical Systems',
  'Plumbing',
  'Intercom & Access Control',
  'IT/Networking',
  'Housekeeping Contract',
  'Security Agency',
  'Solar/Renewable',
  'Gym Equipment',
  'Swimming Pool',
  'Parking Management',
  'Air Conditioning (Central)',
  'Pumps & Motors',
  'Other',
] as const;

export const AMC_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const PAYMENT_FREQUENCIES = [
  'Annual',
  'Bi-annual',
  'Quarterly',
  'Monthly',
] as const;
export const REMINDER_DAY_OPTIONS = [90, 60, 30, 15, 7] as const;

export const AmcContractSchema = z.object({
  associationId: z.string().uuid(),
  name: z.string().min(1, 'Contract name is required').max(255),
  vendorName: z.string().min(1, 'Vendor name is required').max(255),
  vendorContactPerson: z.string().max(100).nullable().optional(),
  vendorPhone: z.string().max(20).nullable().optional(),
  vendorEmail: z.string().email().nullable().optional(),
  category: z.enum(AMC_CATEGORIES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  contractValue: z.coerce.number().min(0, 'Value must be 0 or more'),
  paymentFrequency: z.enum(PAYMENT_FREQUENCIES).default('Annual'),
  nextPaymentDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  autoRenewal: z.boolean().default(false),
  noticePeriodDays: z.coerce.number().int().min(0).nullable().optional(),
  priority: z.enum(AMC_PRIORITIES).default('medium'),
  coverageScope: z.string().max(500).nullable().optional(),
  slaTerms: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  contractDocumentUrl: z.string().url().nullable().optional(),
});

export const UpdateAmcContractSchema = AmcContractSchema.partial().extend({
  id: z.string().uuid(),
  associationId: z.string().uuid(),
});

export const RenewAmcSchema = z.object({
  id: z.string().uuid(),
  associationId: z.string().uuid(),
  newEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  contractValue: z.coerce.number().min(0),
  renewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkedExpenseId: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  contractDocumentUrl: z.string().url().nullable().optional(),
});

export const TerminateAmcSchema = z.object({
  id: z.string().uuid(),
  associationId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export const AmcReminderSettingsSchema = z.object({
  associationId: z.string().uuid(),
  remindDaysBefore: z
    .number()
    .int()
    .refine((v) => [90, 60, 30, 15, 7].includes(v), {
      message: 'Must be one of 90, 60, 30, 15, or 7',
    }),
});

export type AmcContractInput = z.infer<typeof AmcContractSchema>;
export type UpdateAmcContractInput = z.infer<typeof UpdateAmcContractSchema>;
export type RenewAmcInput = z.infer<typeof RenewAmcSchema>;
export type TerminateAmcInput = z.infer<typeof TerminateAmcSchema>;
export type AmcReminderSettingsInput = z.infer<
  typeof AmcReminderSettingsSchema
>;
