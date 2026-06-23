import * as z from 'zod';

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

export const CreateUserSchema = z.object({
  phone: z
    .string()
    .min(10, { message: 'Please enter a valid phone number' })
    .regex(/^\+?[0-9]{10,15}$/, {
      message: 'Phone number must be 10-15 digits, optionally starting with +',
    }),
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
  phone: z
    .string()
    .min(10, { message: 'Please enter a valid phone number' })
    .regex(/^\+?[0-9]{10,15}$/, {
      message: 'Phone number must be 10-15 digits, optionally starting with +',
    }),
  fullName: z
    .string()
    .min(2, { message: 'Full name must be at least 2 characters' }),
  associationId: z.string().uuid().optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
});

export type UpdateUserSchemaType = z.output<typeof UpdateUserSchema>;
