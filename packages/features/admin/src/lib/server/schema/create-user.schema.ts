import * as z from 'zod';

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
});

export type CreateUserSchemaType = z.output<typeof CreateUserSchema>;
