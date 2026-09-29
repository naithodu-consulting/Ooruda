import * as z from 'zod';

export const ACCOUNT_PRODUCT_TYPES = ['association', 'villa'] as const;

export const ACCOUNT_PRODUCT_LABELS: Record<
  (typeof ACCOUNT_PRODUCT_TYPES)[number],
  string
> = {
  association: 'Association',
  villa: 'Villa',
};

export const CreateAssociationSchema = z.object({
  name: z
    .string()
    .min(2, { message: 'Account name must be at least 2 characters' }),
  ownerId: z.string().uuid({ message: 'Please select an owner' }),
  // Immutable once created (enforced in the database).
  productType: z.enum(ACCOUNT_PRODUCT_TYPES).default('association'),
});

export type CreateAssociationSchemaType = z.output<
  typeof CreateAssociationSchema
>;
