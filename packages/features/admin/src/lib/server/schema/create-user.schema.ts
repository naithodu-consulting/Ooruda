import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

// Accepts international E.164 numbers, or a bare 10-digit number (treated as
// Indian by default). Normalization to E.164 happens in the server action.
const phoneNumber = z.string().refine((v) => normalizePhoneNumber(v) !== null, {
  message: 'Enter a valid phone number (with country code, or 10-digit Indian)',
});

export const ASSIGNABLE_ROLES = [
  'assoc_admin',
  'billing_operator',
  'prop_owner',
  'tenant',
] as const;

export const ROLE_LABELS: Record<(typeof ASSIGNABLE_ROLES)[number], string> = {
  assoc_admin: 'Association Admin',
  billing_operator: 'Billing Operator',
  prop_owner: 'Property Owner',
  tenant: 'Tenant',
};

// Email is mandatory: it is the secondary (email-OTP) login identity and is
// required everywhere a user is created or edited.
const email = z
  .string()
  .min(1, { message: 'Email is required' })
  .email({ message: 'Please enter a valid email address' });

export const CreateUserSchema = z.object({
  phone: phoneNumber,
  email,
  fullName: z
    .string()
    .min(2, { message: 'Full name must be at least 2 characters' }),
  associationId: z.string().uuid({ message: 'Please select an association' }),
  role: z.enum(ASSIGNABLE_ROLES, {
    message: 'Please select a role',
  }),
});

export type CreateUserSchemaType = z.output<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  userId: z.string().uuid(),
  phone: phoneNumber,
  email,
  fullName: z
    .string()
    .min(2, { message: 'Full name must be at least 2 characters' }),
  associationId: z.string().uuid().optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
});

export type UpdateUserSchemaType = z.output<typeof UpdateUserSchema>;
