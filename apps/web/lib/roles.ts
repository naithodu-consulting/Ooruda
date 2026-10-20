/**
 * Role and product constants shared by server and client code.
 *
 * `lib/rbac.ts` is server-only; anything a Client Component needs to know
 * about roles (sidebar, role labels) lives here instead.
 *
 * Ooruda runs two products on one Supabase project. Every team account has
 * an immutable `accounts.product_type`, and a database trigger guarantees a
 * membership's role belongs to the same product as its account — so a role
 * alone tells you which product a workspace is.
 */

export const PRODUCT_TYPES = ['association', 'villa'] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PROPOPS_ROLES = [
  'assoc_admin',
  'billing_operator',
  'prop_owner',
  'tenant',
] as const;

export type PropOpsRole = (typeof PROPOPS_ROLES)[number];

export const VILLA_ROLES = ['villa_admin', 'villa_manager'] as const;

export type VillaRole = (typeof VILLA_ROLES)[number];

export type AppRole = PropOpsRole | VillaRole;

export const VILLA_ROLE_LABELS: Record<VillaRole, string> = {
  villa_admin: 'Villa Admin',
  villa_manager: 'Villa Manager',
};

/**
 * `public.roles.hierarchy_level` for each role (lower = more privileged).
 * Mirrors the database; villa roles start at 10 (see the M0 migration).
 */
export const ROLE_HIERARCHY_LEVEL_BY_ROLE: Record<AppRole, number> = {
  assoc_admin: 1,
  billing_operator: 2,
  prop_owner: 3,
  tenant: 4,
  villa_admin: 10,
  villa_manager: 11,
};

/** The role a platform super-admin acts as inside a workspace. */
export const SUPER_ADMIN_ROLE_BY_PRODUCT: Record<ProductType, AppRole> = {
  association: 'assoc_admin',
  villa: 'villa_admin',
};

export function isVillaRole(
  role: string | null | undefined,
): role is VillaRole {
  return !!role && (VILLA_ROLES as readonly string[]).includes(role);
}

export function productForRole(role: string | null | undefined): ProductType {
  return isVillaRole(role) ? 'villa' : 'association';
}
