import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

import { ID_DOC_TYPES } from '~/lib/villa/guest-ids';

const bookingRef = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
  bookingId: z.string().uuid(),
};

const phone = z
  .string()
  .trim()
  .refine((v) => v === '' || normalizePhoneNumber(v) !== null, {
    message: 'Enter a valid phone number, or leave it empty',
  });

/** A guest on a booking: an existing register entry, or a new one. */
const guestChoice = {
  guestId: z.string().uuid().or(z.literal('')),
  newGuestName: z.string().trim().max(120),
  newGuestPhone: phone,
  isAdult: z.boolean(),
};

const needsGuest = (v: { guestId: string; newGuestName: string }) =>
  v.guestId !== '' || v.newGuestName !== '';

const needsGuestMessage = {
  message: 'Pick a guest or enter a name',
  path: ['newGuestName'],
};

export const AddGuestSchema = z
  .object({ ...bookingRef, ...guestChoice })
  .refine(needsGuest, needsGuestMessage);

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
  .refine(needsGuest, needsGuestMessage);

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
