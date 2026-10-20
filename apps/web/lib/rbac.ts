import 'server-only';
import { cache } from 'react';

import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

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

type ResolvedRole = {
  role: PropOpsRole | null;
  accountId: string;
  accountName: string;
  associationId: string | null;
  associationStatus: string | null;
  userId: string;
  isSuperAdmin: boolean;
};

/**
 * Resolves the caller's role in an association in a single round trip.
 *
 * Cached per request: the workspace layout, the page and any nested server
 * component all share one lookup. The user comes from
 * `requireUserInServerComponent`, which the layout has already resolved, so
 * no extra call to the Auth server is made.
 */
const resolveRole = cache(
  async (accountSlug: string): Promise<ResolvedRole> => {
    const client = getSupabaseServerClient();
    const user = await requireUserInServerComponent();

    const [{ data: account }, { data: isSuperAdmin }] = await Promise.all([
      client
        .from('accounts')
        .select(
          'id, name, associations(id, status), accounts_memberships(account_role)',
        )
        .eq('slug', accountSlug)
        .eq('is_personal_account', false)
        .eq('accounts_memberships.user_id', user.id)
        .maybeSingle(),
      client.rpc('is_super_admin'),
    ]);

    if (!account) {
      notFound();
    }

    const association = one(account.associations);
    const membership = one(account.accounts_memberships);

    return {
      role: isSuperAdmin
        ? 'assoc_admin'
        : ((membership?.account_role as PropOpsRole | undefined) ?? null),
      accountId: account.id,
      accountName: account.name,
      associationId: association?.id ?? null,
      associationStatus: association?.status ?? null,
      userId: user.id,
      isSuperAdmin: !!isSuperAdmin,
    };
  },
);

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * Asserts the authenticated user holds one of `allowedRoles` in the given
 * association (identified by its MakerKit account slug).
 *
 * - Redirects to /auth/sign-in if not logged in.
 * - 404s if the account slug doesn't exist.
 * - Redirects to /home if the user has no membership or the wrong role.
 *
 * Also returns the association id, so pages need no second lookup for it.
 *
 * Use in Server Components and Route Handlers (never in Client Components).
 */
export async function requireRole(
  accountSlug: string,
  allowedRoles: PropOpsRole[],
): Promise<{
  role: PropOpsRole;
  accountId: string;
  accountName: string;
  associationId: string | null;
  associationStatus: string | null;
  userId: string;
  isSuperAdmin: boolean;
}> {
  const { role, ...rest } = await resolveRole(accountSlug);

  if (!role || !allowedRoles.includes(role)) {
    redirect('/home');
  }

  return { role, ...rest };
}

/**
 * Returns the current user's role in the association identified by its own id
 * (not the account slug), or null if they have no membership.
 *
 * Use this in Server Actions for an explicit authorization check before a
 * mutation - defense-in-depth on top of the database RLS policies.
 */
export async function getAssociationRole(
  associationId: string,
): Promise<PropOpsRole | null> {
  const client = getSupabaseServerClient();
  const userId = await getCurrentUserId();

  if (!userId) {
    return null;
  }

  // One query for the association + this user's membership, in parallel with
  // the super-admin check (was four sequential round trips).
  const [{ data: association }, { data: isSuperAdmin }] = await Promise.all([
    client
      .from('associations')
      .select('account_id, accounts!inner(accounts_memberships(account_role))')
      .eq('id', associationId)
      .eq('accounts.accounts_memberships.user_id', userId)
      .maybeSingle(),
    client.rpc('is_super_admin'),
  ]);

  if (!association) {
    return null;
  }

  if (isSuperAdmin) {
    return 'assoc_admin';
  }

  const account = one(
    association.accounts as
      | { accounts_memberships: { account_role: string }[] | null }
      | { accounts_memberships: { account_role: string }[] | null }[]
      | null,
  );
  const membership = one(account?.accounts_memberships ?? null);

  return (membership?.account_role as PropOpsRole | undefined) ?? null;
}

/**
 * The signed-in user's id, from the verified session JWT.
 *
 * `getClaims` verifies the token locally when the project uses asymmetric
 * signing keys (and falls back to the Auth server otherwise), so this avoids
 * the unconditional network round trip of `getUser`.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const client = getSupabaseServerClient();
  const { data } = await client.auth.getClaims();

  return data?.claims?.sub ?? null;
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
