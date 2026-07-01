import 'server-only';
import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export const PROPOPS_ROLES = [
  'assoc_admin',
  'billing_operator',
  'prop_owner',
  'tenant',
] as const;

export type PropOpsRole = (typeof PROPOPS_ROLES)[number];

export const ROLE_HIERARCHY: Record<PropOpsRole, number> = {
  assoc_admin: 1,
  billing_operator: 2,
  prop_owner: 3,
  tenant: 4,
};

export const ROLE_LABELS: Record<PropOpsRole, string> = {
  assoc_admin: 'Association Admin',
  billing_operator: 'Billing Operator',
  prop_owner: 'Property Owner',
  tenant: 'Tenant',
};

/**
 * Asserts the authenticated user holds one of `allowedRoles` in the given
 * association (identified by its MakerKit account slug).
 *
 * - Redirects to /auth/sign-in if not logged in.
 * - 404s if the account slug doesn't exist.
 * - Redirects to /home if the user has no membership or the wrong role.
 *
 * Use in Server Components and Route Handlers (never in Client Components).
 */
export async function requireRole(
  accountSlug: string,
  allowedRoles: PropOpsRole[],
): Promise<{ role: PropOpsRole; accountId: string; userId: string }> {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: account } = await client
    .from('accounts')
    .select('id')
    .eq('slug', accountSlug)
    .eq('is_personal_account', false)
    .single();

  if (!account) {
    notFound();
  }

  const { data: isSuperAdmin } = await client.rpc('is_super_admin');
  if (isSuperAdmin) {
    return { role: 'assoc_admin', accountId: account.id, userId: user.id };
  }

  const { data: membership } = await client
    .from('accounts_memberships')
    .select('account_role')
    .eq('account_id', account.id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    redirect('/home');
  }

  const role = membership.account_role as PropOpsRole;

  if (!allowedRoles.includes(role)) {
    redirect('/home');
  }

  return { role, accountId: account.id, userId: user.id };
}

/**
 * Returns the current user's role in the association identified by its own id
 * (not the account slug), or null if they have no membership.
 *
 * Use this in Server Actions for an explicit authorization check before a
 * mutation — defense-in-depth on top of the database RLS policies.
 */
export async function getAssociationRole(
  associationId: string,
): Promise<PropOpsRole | null> {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: association } = await client
    .from('associations')
    .select('account_id')
    .eq('id', associationId)
    .single();

  if (!association) {
    return null;
  }

  const { data: isSuperAdmin } = await client.rpc('is_super_admin');
  if (isSuperAdmin) {
    return 'assoc_admin';
  }

  const { data: membership } = await client
    .from('accounts_memberships')
    .select('account_role')
    .eq('account_id', association.account_id)
    .eq('user_id', user.id)
    .single();

  return (membership?.account_role as PropOpsRole) ?? null;
}

/**
 * Returns true if the user's role is at least as privileged as `minimumRole`.
 * Lower hierarchy_level = more privileged.
 *
 * Example: hasMinimumRole('billing_operator', 'prop_owner') === true
 */
export function hasMinimumRole(
  userRole: PropOpsRole,
  minimumRole: PropOpsRole,
): boolean {
  return ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[minimumRole];
}
