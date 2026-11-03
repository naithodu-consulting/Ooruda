import * as z from 'zod';

import { isPhoneEmpty, normalizePhoneNumber } from '@kit/shared/utils';

import { ID_DOC_TYPES } from '~/lib/villa/guest-ids';

const bookingRef = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
  bookingId: z.string().uuid(),
};

const phone = z
  .string()
  .trim()
  .max(25)
  .refine((v) => isPhoneEmpty(v) || normalizePhoneNumber(v) !== null, {
    message:
      'Enter a valid phone number (10-digit mobile or international with country code), or leave it empty',
  });

export const GUEST_SALUTATIONS = ['Mr', 'Mrs', 'Ms'] as const;
export type GuestSalutation = (typeof GUEST_SALUTATIONS)[number];

/** A guest on a booking: an existing register entry, or a new one. */
const guestChoice = {
  guestId: z.string().uuid().or(z.literal('')),
  newGuestSalutation: z.enum(GUEST_SALUTATIONS).or(z.literal('')).optional(),
  newGuestFirstName: z.string().trim().max(120).optional().default(''),
  newGuestLastName: z.string().trim().max(120).optional().default(''),
  newGuestName: z.string().trim().max(120).optional().default(''),
  newGuestPhone: phone,
  isAdult: z.boolean(),
};

const needsSalutation = (v: { guestId: string; newGuestSalutation?: string }) =>
  v.guestId !== '' || ['Mr', 'Mrs', 'Ms'].includes(v.newGuestSalutation ?? '');

const needsFirstName = (v: {
  guestId: string;
  newGuestFirstName?: string;
  newGuestName?: string;
}) =>
  v.guestId !== '' ||
  (v.newGuestFirstName?.trim().length ?? 0) > 0 ||
  (v.newGuestName?.trim().length ?? 0) > 0;

export const AddGuestSchema = z
  .object({ ...bookingRef, ...guestChoice })
  .refine(needsSalutation, {
    message: 'Select a salutation',
    path: ['newGuestSalutation'],
  })
  .refine(needsFirstName, {
    message: 'Enter first name',
    path: ['newGuestFirstName'],
  });

export type AddGuestInput = z.input<typeof AddGuestSchema>;

/**
 * An ID document. `idNumber` is the raw number as typed: the server masks it
 * and never stores it. The file itself travels separately (multipart upload
 * route); this schema is shared by that route and the no-file action.
 */
export const RecordIdSchema = z
  .object({
    ...bookingRef,
    ...guestChoice,
    docType: z.enum(ID_DOC_TYPES),
    idNumber: z.string().trim().max(40),
    stage: z.enum(['soft_copy', 'seen_in_person']),
  })
  .refine(needsSalutation, {
    message: 'Select a salutation',
    path: ['newGuestSalutation'],
  })
  .refine(needsFirstName, {
    message: 'Enter first name',
    path: ['newGuestFirstName'],
  });

export type RecordIdInput = z.input<typeof RecordIdSchema>;

export const IdStatusSchema = z.object({
  ...bookingRef,
  status: z.enum(['received', 'verified']),
});

export const DeleteIdSchema = z.object({
  accountId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const MarkDocVerifiedSchema = z.object({
  ...bookingRef,
  documentId: z.string().uuid(),
});

export const RemoveGuestSchema = z.object({
  ...bookingRef,
  guestId: z.string().uuid(),
});
