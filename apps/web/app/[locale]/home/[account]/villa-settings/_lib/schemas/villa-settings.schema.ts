import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

import { ADDON_UNITS, CONTACT_CATEGORIES } from '~/lib/villa/labels';

/**
 * Villa settings forms. Shared by the client forms and the server actions.
 * Money fields are strings in rupees (at most 2 decimals) — converted to
 * paise only inside lib/villa-db.
 */

const ids = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
};

const rupees = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, {
    message: 'Enter an amount in rupees, e.g. 12000',
  });

const optionalRupees = z
  .string()
  .trim()
  .regex(/^(\d{1,9}(\.\d{1,2})?)?$/, {
    message: 'Enter an amount in rupees, e.g. 700',
  });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' });

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Use HH:MM, e.g. 14:00' });

export const BaseRatesSchema = z
  .object({
    ...ids,
    weekdayNightly: rupees,
    weekendNightly: rupees,
    includedGuests: z.coerce.number().int().min(1).max(100),
    maxGuests: z.coerce.number().int().min(1).max(100),
    // Marketing copy on the site ("Ideal for 8–14 guests") and the booking
    // form's default guest count, so it must not exceed maxGuests.
    idealGuests: z.coerce.number().int().min(1).max(100),
    extraGuestRate: rupees,
    extraGuestTier2Rate: optionalRupees,
    // '' = no second tier
    extraGuestTier2From: z.union([
      z.literal(''),
      z.coerce.number().int().min(2).max(100),
    ]),
    checkInTime: hhmm,
    checkOutTime: hhmm,
  })
  .refine((v) => v.maxGuests >= v.includedGuests, {
    message: 'Must be at least the guests included',
    path: ['maxGuests'],
  })
  .refine((v) => v.idealGuests <= v.maxGuests, {
    message: 'Cannot be more than the maximum guests',
    path: ['idealGuests'],
  })
  .refine(
    (v) => (v.extraGuestTier2Rate === '') === (v.extraGuestTier2From === ''),
    {
      message: 'Set both second-tier fields, or neither',
      path: ['extraGuestTier2From'],
    },
  )
  // Mirrors the booking site's properties_extra_guest_tier2_valid constraint.
  .refine(
    (v) =>
      v.extraGuestTier2From === '' ||
      (v.extraGuestTier2From > v.includedGuests + 1 &&
        v.extraGuestTier2From <= v.maxGuests),
    {
      message:
        'Must be after the first extra guest and no more than the maximum',
      path: ['extraGuestTier2From'],
    },
  );

export type BaseRatesInput = z.input<typeof BaseRatesSchema>;

export const SeasonalRateSchema = z
  .object({
    ...ids,
    name: z
      .string()
      .trim()
      .min(1, { message: 'Name the rate, e.g. Diwali' })
      .max(150),
    firstNight: ymd,
    // The LAST night the rate applies — converted to the site's exclusive end.
    lastNight: ymd,
    nightlyRate: rupees,
    minStayNights: z.coerce.number().int().min(1).max(60),
  })
  .refine((v) => v.lastNight >= v.firstNight, {
    message: 'The last night must be on or after the first night',
    path: ['lastNight'],
  });

export type SeasonalRateInput = z.input<typeof SeasonalRateSchema>;

export const DeleteSeasonalRateSchema = z.object({
  ...ids,
  ruleId: z.string().uuid(),
});

export const AddonSchema = z.object({
  ...ids,
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, { message: 'Enter a name' }).max(80),
  description: z.string().trim().max(500),
  price: rupees,
  pricingUnit: z.enum(ADDON_UNITS),
  isActive: z.boolean(),
});

export type AddonInput = z.input<typeof AddonSchema>;

export const DeleteAddonSchema = z.object({ ...ids, id: z.string().uuid() });

export const ContactSchema = z.object({
  ...ids,
  id: z.string().uuid().optional(),
  category: z.enum(CONTACT_CATEGORIES),
  name: z.string().trim().min(1, { message: 'Enter a name' }).max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => normalizePhoneNumber(v) !== null, {
      message:
        'Enter a valid phone number (with country code, or 10-digit Indian)',
    }),
  notes: z.string().trim().max(300),
  shareWithGuests: z.boolean(),
});

export type ContactInput = z.input<typeof ContactSchema>;

export const DeleteContactSchema = z.object({ ...ids, id: z.string().uuid() });

export const PoliciesSchema = z.object({
  ...ids,
  managersCanCancel: z.boolean(),
  preArrivalEmail: z.boolean(),
  thankYouEmail: z.boolean(),
  otaBufferNights: z.coerce.number().int().min(0).max(14),
  // Where guests send their IDs. Optional.
  whatsappNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhoneNumber(v) !== null, {
      message: 'Enter a valid WhatsApp number, or leave it empty',
    }),
});

export type PoliciesInput = z.input<typeof PoliciesSchema>;

export { ADDON_UNITS, CONTACT_CATEGORIES };
