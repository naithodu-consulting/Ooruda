import 'server-only';
import { cache } from 'react';

import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  type AppRole,
  type PropOpsRole,
  type ProductType,
  SUPER_ADMIN_ROLE_BY_PRODUCT,
} from '~/lib/roles';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export {
  PROPOPS_ROLES,
  VILLA_ROLES,
  type AppRole,
  type PropOpsRole,
  type ProductType,
  type VillaRole,
} from '~/lib/roles';

export const ROLE_HIERARCHY: Record<PropOpsRole, number> = {
  assoc_admin: 1,
  billing_operator: 2,
  prop_owner: 3,
  tenant: 4,
};

export const ROLE_LABELS: Record<PropOpsRole, string> = {
  assoc_admin: 'Association Admin',
  billing_operator: 'Billing Operator',
  prop_owner: 'Unit Owner',
  tenant: 'Tenant',
};

type ResolvedRole = {
  role: AppRole | null;
  productType: ProductType;
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
          'id, name, product_type, associations(id, status), accounts_memberships(account_role)',
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
    const productType = (account.product_type ?? 'association') as ProductType;

    return {
      role: isSuperAdmin
        ? SUPER_ADMIN_ROLE_BY_PRODUCT[productType]
        : ((membership?.account_role as AppRole | undefined) ?? null),
      productType,
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
 * The caller's account context (role, product, ids) without asserting a role.
 *
 * Shares `requireRole`'s cached lookup, so calling both in one request costs
 * one round trip. Use it where a page must branch on the product before it
 * knows which roles to require (e.g. the account home page).
 */
export async function getAccountContext(accountSlug: string) {
  return resolveRole(accountSlug);
}

/**
 * Asserts the authenticated user holds one of `allowedRoles` in the given
 * account (identified by its MakerKit account slug), and that the account is
 * of the expected product.
 *
 * - Redirects to /auth/sign-in if not logged in.
 * - 404s if the account slug doesn't exist.
 * - Redirects to the account home if the account belongs to a different
 *   product (e.g. a villa account opening an association page). The account
 *   home renders the right dashboard for either product, so this never loops.
 * - Redirects to /home if the user has no membership or the wrong role.
 *
 * `product` defaults to 'association', so every existing association page is
 * gated against villa accounts without being edited. Pass 'any' for pages
 * shared by both products.
 *
 * Also returns the association id, so pages need no second lookup for it.
 *
 * Use in Server Components and Route Handlers (never in Client Components).
 */
export async function requireRole<R extends AppRole>(
  accountSlug: string,
  allowedRoles: readonly R[],
  product: ProductType | 'any' = 'association',
): Promise<{
  role: R;
  productType: ProductType;
  accountId: string;
  accountName: string;
  associationId: string | null;
  associationStatus: string | null;
  userId: string;
  isSuperAdmin: boolean;
}> {
  const { role, ...rest } = await resolveRole(accountSlug);

  if (product !== 'any' && rest.productType !== product) {
    redirect(`/home/${accountSlug}`);
  }

  if (!role || !(allowedRoles as readonly AppRole[]).includes(role)) {
    redirect('/home');
  }

  return { role: role as R, ...rest };
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
