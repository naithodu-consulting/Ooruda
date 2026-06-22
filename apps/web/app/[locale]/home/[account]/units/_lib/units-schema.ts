import * as z from 'zod';

export const UNIT_TYPES = ['Shop', 'Office', 'Warehouse'] as const;

export const CreateUnitSchema = z.object({
  unit_no: z
    .string()
    .trim()
    .min(1, 'Unit number is required')
    .max(50, 'Unit number is too long'),
  type: z.enum(UNIT_TYPES),
  // Optional: an empty input should mean "no floor" (undefined), not 0. So we
  // normalise blanks to undefined before validating, instead of z.coerce which
  // would turn '' into 0.
  floor: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number()
      .int()
      .min(-5, 'Floor looks too low')
      .max(200, 'Floor looks too high')
      .optional(),
  ),
  area_sqft: z.coerce
    .number()
    .positive('Area must be greater than 0')
    .max(1_000_000, 'Area looks too large'),
});

export type CreateUnitInput = z.input<typeof CreateUnitSchema>;

// Same shape as create — editing a unit touches the same fields.
export const UpdateUnitSchema = CreateUnitSchema;
export type UpdateUnitInput = z.input<typeof UpdateUnitSchema>;

export const AssignTenantSchema = z.object({
  tenantId: z.string().uuid('Choose a tenant'),
  startDate: z
    .string()
    .min(1, 'Start date is required')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date'),
});

export type AssignTenantInput = z.input<typeof AssignTenantSchema>;
