import * as z from 'zod';

const MANAGEABLE_ROLES = ['prop_owner', 'tenant', 'billing_operator'] as const;

export const AssocAdminPermissionsSchema = z.object({
  associationId: z.string().uuid(),
  permissions: z
    .array(
      z.object({
        targetRole: z.enum(MANAGEABLE_ROLES),
        canInvite: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      }),
    )
    .length(3)
    .refine(
      (arr) => new Set(arr.map((p) => p.targetRole)).size === arr.length,
      { message: 'Permissions must contain unique roles' },
    ),
});

export type AssocAdminPermissionsSchemaType = z.output<
  typeof AssocAdminPermissionsSchema
>;
