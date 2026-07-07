import * as z from 'zod';

export const UNIT_TYPES = [
  'Shop',
  'Office',
  'Warehouse',
  'Common Area',
] as const;

export const CreateUnitSchema = z
  .object({
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
      (v) =>
        v === '' || v === null || v === undefined ? undefined : Number(v),
      z
        .number()
        .int()
        .min(-5, 'Floor looks too low')
        .max(200, 'Floor looks too high')
        .optional(),
    ),
    area_sqft: z.coerce
      .number()
      .int('Area must be a whole number')
      .min(0, 'Area cannot be negative')
      .max(1_000_000, 'Area looks too large'),
    door_no: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v)),
      z.string().max(100, 'Door number is too long').nullable().optional(),
    ),
  })
  .refine((data) => data.type === 'Common Area' || data.area_sqft > 0, {
    message: 'Area must be greater than 0 for this unit type',
    path: ['area_sqft'],
  });

export type CreateUnitInput = z.input<typeof CreateUnitSchema>;

const nullableText = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : String(v)),
    z.string().max(max, `${label} is too long`).nullable().optional(),
  );

// Same shape as create, plus optional owner_id and billing entity fields
export const UpdateUnitSchema = CreateUnitSchema.extend({
  owner_id: z.preprocess(
    (v) =>
      v === '__unassigned__' || v === '' || v === null || v === undefined
        ? null
        : v,
    z.string().uuid().nullable().optional(),
  ),
  bill_to: z.enum(['auto', 'owner', 'tenant']).default('auto'),
  owner_is_company: z.boolean().default(false),
  owner_company_name: nullableText(200, 'Company name'),
  owner_company_address: nullableText(500, 'Company address'),
  owner_company_gstin: nullableText(15, 'Company GSTIN'),
});
export type UpdateUnitInput = z.input<typeof UpdateUnitSchema>;

export const AssignTenantSchema = z.object({
  tenantId: z.string().uuid('Choose a tenant'),
  startDate: z
    .string()
    .min(1, 'Start date is required')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date'),
  isCompany: z.boolean().default(false),
  companyName: nullableText(200, 'Company name'),
  companyAddress: nullableText(500, 'Company address'),
  companyGstin: nullableText(15, 'Company GSTIN'),
});

export type AssignTenantInput = z.input<typeof AssignTenantSchema>;
