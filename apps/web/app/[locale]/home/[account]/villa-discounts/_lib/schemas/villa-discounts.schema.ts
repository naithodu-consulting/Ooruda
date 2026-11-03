import * as z from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' });

const optionalInt = (max: number) =>
  z.union([z.literal(''), z.coerce.number().int().min(1).max(max)]);

export const DiscountSchema = z
  .object({
    accountId: z.string().uuid(),
    propertyId: z.string().uuid(),
    id: z.string().uuid().or(z.literal('')),
    code: z
      .string()
      .transform((v) => v.toUpperCase().replace(/\s/g, ''))
      .pipe(
        z.string().regex(/^[A-Z0-9]{4,20}$/, {
          message: '4 to 20 letters and digits, e.g. MONSOON10',
        }),
      ),
    discountType: z.enum(['percent', 'flat']),
    discountValue: z.coerce
      .number()
      .positive({ message: 'Enter the discount' }),
    maxDiscount: z.union([z.literal(''), z.coerce.number().positive()]),
    validFrom: ymd,
    validTo: ymd,
    minNights: z.union([
      z.literal(''),
      z.coerce
        .number()
        .int()
        .min(1, 'At least 1 night')
        .max(60, 'Up to 60 nights'),
    ]),
    minBookingValue: z.union([
      z.literal(''),
      z.coerce.number().min(0).max(10_000_000),
    ]),
    maxUses: optionalInt(100_000),
    maxUsesPerGuest: z.union([
      z.literal(''),
      z.coerce
        .number()
        .int()
        .min(1, 'At least 1 use')
        .max(999, 'Up to 999 uses per guest'),
    ]),
    blackouts: z.array(z.object({ start: ymd, lastNight: ymd })).max(30),
    note: z.string().trim().max(300),
  })
  .superRefine((v, ctx) => {
    if (v.validTo < v.validFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'The last day cannot be before the first',
      });
    }
    if (v.discountType === 'percent') {
      if (!Number.isInteger(v.discountValue) || v.discountValue > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['discountValue'],
          message: 'A whole percentage, 1 to 100',
        });
      }
      if (v.maxDiscount === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['maxDiscount'],
          message: 'Set the most a booking can save (e.g. ₹3,000)',
        });
      }
    }
    v.blackouts.forEach((b, i) => {
      if (b.lastNight < b.start) {
        ctx.addIssue({
          code: 'custom',
          path: ['blackouts', i, 'lastNight'],
          message: 'Ends before it starts',
        });
      }
    });
  });

export type DiscountInput = z.input<typeof DiscountSchema>;

export const DiscountToggleSchema = z.object({
  accountId: z.string().uuid(),
  id: z.string().uuid(),
  active: z.boolean(),
});

export const DiscountArchiveSchema = z.object({
  accountId: z.string().uuid(),
  id: z.string().uuid(),
});

export const DiscountReviewSchema = z.object({
  accountId: z.string().uuid(),
  id: z.string().uuid(),
  approve: z.boolean(),
});

/** Codes above this need Ooruda's approval (the database enforces it too). */
export const DISCOUNT_CEILING_PCT = 25;

/** Same rule as the database's needs_approval column, for the form's hint. */
export function needsApproval(v: {
  discountType: 'percent' | 'flat';
  discountValue: number;
  minBookingValue: number | string;
}): boolean {
  const minVal = Number(v.minBookingValue) || 0;
  return v.discountType === 'percent'
    ? v.discountValue > DISCOUNT_CEILING_PCT
    : minVal === 0 || v.discountValue > (minVal * DISCOUNT_CEILING_PCT) / 100;
}
