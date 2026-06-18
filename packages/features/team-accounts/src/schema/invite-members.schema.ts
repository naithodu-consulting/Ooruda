import * as z from 'zod';

// A valid Indian mobile number: 10 digits starting 6-9.
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Normalize a user-entered Indian phone number to E.164 form ('+91XXXXXXXXXX').
 *
 * Accepts a bare 10-digit number, or one prefixed with +91 / 91 / 0, and
 * ignores spaces and dashes. Returns `null` when the input is not a valid
 * Indian mobile number.
 */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '').replace(/^\+/, '');

  let local = digits;

  if (local.startsWith('91') && local.length === 12) {
    local = local.slice(2);
  } else if (local.startsWith('0') && local.length === 11) {
    local = local.slice(1);
  }

  return INDIAN_MOBILE.test(local) ? `+91${local}` : null;
}

const InviteSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((value) => normalizeIndianPhone(value) !== null, {
      message:
        'Enter a valid Indian mobile number (10 digits, optionally with +91)',
    })
    // Store the normalized E.164 value downstream.
    .transform((value) => normalizeIndianPhone(value) as string),
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
