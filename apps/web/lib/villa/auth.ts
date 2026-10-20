import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { type VillaRole, isVillaRole } from '~/lib/roles';

/**
 * The caller's role in a villa account, for server actions — defence in depth
 * on top of RLS, like getAssociationRole() for associations. A platform
 * super-admin acts as villa_admin. Null for non-members and non-villa accounts.
 */
export async function getVillaRole(
  accountId: string,
): Promise<VillaRole | null> {
  const client = getSupabaseServerClient();

  const { data: role, error } = await client.rpc('villa_role', {
    p_account_id: accountId,
  });

  if (error) {
    const logger = await getLogger();
    logger.error({ accountId, code: error.code }, 'villa_role lookup failed');
    return null;
  }

  if (isVillaRole(role)) return role;

  // Only a non-member needs the super-admin check.
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

  if (!isSuperAdmin) return null;

  const { data: account } = await client
    .from('accounts')
    .select('product_type')
    .eq('id', accountId)
    .maybeSingle();

  return account?.product_type === 'villa' ? 'villa_admin' : null;
}

/** Throws unless the caller holds one of `allowed` in the villa account. */
export async function requireVillaRole(
  accountId: string,
  allowed: readonly VillaRole[],
): Promise<VillaRole> {
  const role = await getVillaRole(accountId);

  if (!role || !allowed.includes(role)) {
    throw new Error("You don't have permission to do this.");
  }

  return role;
}
