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

/**
 * A named rate over an arbitrary set of nights — 20–25 December AND New
 * Year's Eve, picked together on the calendar and saved as one rate.
 *
 * `replaceRuleIds` are the rows the rate is made of today; an edit rewrites
 * them, because changing the nights changes how many rows it takes.
 */
export const RateGroupSchema = z.object({
  ...ids,
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name the rate, e.g. Diwali' })
    .max(150),
  nights: z
    .array(ymd)
    .min(1, { message: 'Pick at least one night on the calendar' })
    // A whole year of separate nights is not a rate, it is a mistake.
    .max(400, { message: 'That is too many nights for one rate' }),
  nightlyRate: rupees,
  minStayNights: z.coerce.number().int().min(1).max(60),
  replaceRuleIds: z.array(z.string().uuid()).max(400),
});

export type RateGroupInput = z.input<typeof RateGroupSchema>;

export const DeleteRateGroupSchema = z.object({
  ...ids,
  ruleIds: z.array(z.string().uuid()).min(1).max(400),
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

/**
 * The company behind the villa: what the guest booking confirmation prints in
 * its footer, and what the receipt voucher prints as the supplier. Every field
 * is optional - a villa that fills in none of them gets no footer rather than
 * an empty one.
 */
export const BusinessDetailsSchema = z.object({
  ...ids,
  legalName: z.string().trim().max(150),
  gstin: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) =>
        v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
      { message: 'A GSTIN is 15 characters, e.g. 29ABCDE1234F1Z5' },
    ),
  // Mirrors villa_properties_legal_address_check. Without the lower bound a
  // 1-4 character address passed the form and was refused by Postgres, which
  // surfaces as the service's blanket "Could not save" with no field named.
  legalAddress: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || v.length >= 5, {
      message: 'Enter the full registered address, or leave it empty',
    }),
  cin: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) =>
        v === '' || /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(v),
      { message: 'A CIN is 21 characters, e.g. U47711KA2025PTC207750' },
    ),
  // .max mirrors villa_properties_support_email_check.
  supportEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: 'Enter a valid email address, or leave it empty',
    }),
  // Where guests send their IDs and reach the property on WhatsApp.
  whatsappNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhoneNumber(v) !== null, {
      message: 'Enter a valid WhatsApp number or leave it empty',
    }),
});

export type BusinessDetailsInput = z.input<typeof BusinessDetailsSchema>;

export const PoliciesSchema = z.object({
  ...ids,
  managersCanCancel: z.boolean(),
  preArrivalEmail: z.boolean(),
  thankYouEmail: z.boolean(),
  otaBufferNights: z.coerce.number().int().min(0).max(14),
  // Printed on receipt vouchers.
  legalName: z.string().trim().max(150),
  gstin: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) =>
        v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
      { message: 'A GSTIN is 15 characters, e.g. 29ABCDE1234F1Z5' },
    ),
  // Where guests send their IDs. Optional.
  whatsappNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhoneNumber(v) !== null, {
      message: 'Enter a valid WhatsApp number, or leave it empty',
    }),
});

export type PoliciesInput = z.input<typeof PoliciesSchema>;

export const BookingCutoffSchema = z.object({
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
  cutoffDate: z.string().date().nullable(),
});

export const GuestEmailSettingsSchema = z.object({
  accountId: z.string().uuid(),
  preArrivalEmail: z.boolean(),
  thankYouEmail: z.boolean(),
});

export type GuestEmailSettingsInput = z.input<typeof GuestEmailSettingsSchema>;

export { ADDON_UNITS, CONTACT_CATEGORIES };
