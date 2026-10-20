import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

import { Database } from '~/lib/database.types';
import { type ProductType } from '~/lib/roles';

/** Roles an inviter may grant when no per-role gating is configured. */
export const DEFAULT_INVITE_ROLES: Record<ProductType, string[]> = {
  association: ['assoc_admin', 'billing_operator', 'prop_owner', 'tenant'],
  villa: ['villa_admin', 'villa_manager'],
};

export interface AssocAdminPermissionEntry {
  targetRole: string;
  canInvite: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface AssocAdminPermissionMap {
  canInvite: (role: string) => boolean;
  canEdit: (role: string) => boolean;
  canDelete: (role: string) => boolean;
  allowedInviteRoles: string[];
  // Serializable role lists for Client Components (functions can't cross the
  // server/client boundary). `undefined` means no rows are configured for this
  // association → fall back to base hierarchy permissions. An empty array means
  // rows exist but no role has that flag set → deny all.
  editableRoles: string[] | undefined;
  deletableRoles: string[] | undefined;
}

/**
 * Load the assoc_admin permission map for a given association.
 * Returns helper functions that gate invite/edit/delete per target role.
 * RLS ensures only assoc_admin of the association (and super-admin) can read.
 */
export async function loadAssocAdminPermissions(
  client: SupabaseClient<Database>,
  associationId: string,
  productType: ProductType = 'association',
): Promise<AssocAdminPermissionMap> {
  // Per-role invite gating is an association feature (configured by the
  // super-admin per association); villa accounts use plain role hierarchy.
  if (productType === 'villa') {
    return {
      canInvite: () => true,
      canEdit: () => true,
      canDelete: () => true,
      allowedInviteRoles: DEFAULT_INVITE_ROLES.villa,
      editableRoles: undefined,
      deletableRoles: undefined,
    };
  }

  const { data } = await client
    .from('assoc_admin_permissions')
    .select('target_role, can_invite, can_edit, can_delete')
    .eq('association_id', associationId);

  const entries: AssocAdminPermissionEntry[] = (data ?? []).map((r) => ({
    targetRole: r.target_role,
    canInvite: r.can_invite,
    canEdit: r.can_edit,
    canDelete: r.can_delete,
  }));

  const byRole = new Map(entries.map((e) => [e.targetRole, e]));

  // No rows configured → no per-role restriction; base hierarchy applies.
  if (entries.length === 0) {
    return {
      canInvite: () => true,
      canEdit: () => true,
      canDelete: () => true,
      allowedInviteRoles: DEFAULT_INVITE_ROLES[productType],
      editableRoles: undefined,
      deletableRoles: undefined,
    };
  }

  return {
    canInvite: (role) => byRole.get(role)?.canInvite ?? false,
    canEdit: (role) => byRole.get(role)?.canEdit ?? false,
    canDelete: (role) => byRole.get(role)?.canDelete ?? false,
    allowedInviteRoles: entries
      .filter((e) => e.canInvite)
      .map((e) => e.targetRole),
    editableRoles: entries.filter((e) => e.canEdit).map((e) => e.targetRole),
    deletableRoles: entries.filter((e) => e.canDelete).map((e) => e.targetRole),
  };
}
