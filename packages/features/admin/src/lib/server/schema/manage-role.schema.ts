import * as z from 'zod';

import { ASSIGNABLE_ROLES } from './create-user.schema';

export const SetUserRoleSchema = z.object({
  userId: z.string().uuid(),
  associationId: z.string().uuid({ message: 'Please select an association' }),
  role: z.enum(ASSIGNABLE_ROLES, { message: 'Please select a role' }),
});

export const RemoveUserRoleSchema = z.object({
  userId: z.string().uuid(),
  associationId: z.string().uuid(),
});

export type SetUserRoleSchemaType = z.output<typeof SetUserRoleSchema>;
export type RemoveUserRoleSchemaType = z.output<typeof RemoveUserRoleSchema>;
