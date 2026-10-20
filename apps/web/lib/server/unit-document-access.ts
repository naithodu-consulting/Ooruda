import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Can this user read a document (receipt, deposit slip) that belongs to a
 * unit? Members with an admin/operator role can read any unit's documents;
 * owners can read their own unit's; tenants need an active tenancy on it.
 *
 * The membership and tenancy lookups are independent, so they run in
 * parallel rather than one after the other.
 */
export async function canReadUnitDocument(
  client: SupabaseClient,
  params: {
    userId: string;
    accountId: string;
    unitId: string;
    ownerId: string | null;
  },
): Promise<boolean> {
  const { userId, accountId, unitId, ownerId } = params;
  const isOwner = ownerId === userId;

  const [{ data: membership }, { data: tenancy }] = await Promise.all([
    client
      .from('accounts_memberships')
      .select('account_role')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
    isOwner
      ? Promise.resolve({ data: null })
      : client
          .from('tenancies')
          .select('id')
          .eq('tenant_id', userId)
          .eq('unit_id', unitId)
          .eq('status', 'active')
          .maybeSingle(),
  ]);

  if (!membership) {
    return false;
  }

  if (
    membership.account_role === 'assoc_admin' ||
    membership.account_role === 'billing_operator'
  ) {
    return true;
  }

  return isOwner || !!tenancy;
}
