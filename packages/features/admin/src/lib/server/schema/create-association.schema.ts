import * as z from 'zod';

export const CreateAssociationSchema = z.object({
  name: z
    .string()
    .min(2, { message: 'Association name must be at least 2 characters' }),
  ownerId: z.string().uuid({ message: 'Please select an owner' }),
});

export type CreateAssociationSchemaType = z.output<
  typeof CreateAssociationSchema
>;
