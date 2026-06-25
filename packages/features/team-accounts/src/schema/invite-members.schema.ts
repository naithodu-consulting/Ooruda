import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

const InviteSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((value) => normalizePhoneNumber(value) !== null, {
      message:
        'Enter a valid phone number (with country code, or 10-digit Indian)',
    })
    // Store the normalized E.164 value downstream.
    .transform((value) => normalizePhoneNumber(value) as string),
  role: z.string().min(1).max(100),
});

export const InviteMembersSchema = z
  .object({
    invitations: InviteSchema.array().min(1).max(5),
  })
  .refine(
    (data) => {
      const phones = data.invitations.map((member) => member.phone);

      const uniquePhones = new Set(phones);

      return phones.length === uniquePhones.size;
    },
    {
      message: 'Duplicate phone numbers are not allowed',
      path: ['invitations'],
    },
  );
