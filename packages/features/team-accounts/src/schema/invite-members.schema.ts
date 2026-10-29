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
  // Name and email are required: both are captured here so the member has an
  // identity from the moment they are added, rather than appearing as a bare
  // phone number until they fill in a profile themselves.
  name: z.string().trim().min(1, 'Enter the member name').max(255),
  email: z
    .string()
    .trim()
    .min(1, 'Enter the member email')
    .email('Enter a valid email address'),
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
