import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Checks if the current user has access to a specific unit either as an owner or an active tenant.
 */
export async function checkUnitAccess(
  client: SupabaseClient,
  unitId: string,
  userId: string,
): Promise<boolean> {
  const { data: owned } = await client
    .from('units')
    .select('id')
    .eq('id', unitId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (owned) {
    return true;
  }

  const { data: tenancy } = await client
    .from('tenancies')
    .select('id')
    .eq('unit_id', unitId)
    .eq('tenant_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return !!tenancy;
}

/**
 * Returns a list of all units the user has access to within the association.
 * If the user owns units, it returns those. Otherwise, it falls back to active tenancies.
 */
export async function getAccessibleUnits(
  client: SupabaseClient,
  associationId: string,
  userId: string,
): Promise<{ id: string; unit_no: string }[]> {
  // Fetch ALL units owned by this user in this association.
  const { data: ownedUnits } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', associationId)
    .eq('owner_id', userId)
    .order('unit_no');

  let units: { id: string; unit_no: string }[] = ownedUnits ?? [];

  // Fallback: tenant with no owned units — find all active tenancy units in this association.
  if (units.length === 0) {
    const { data: tenancies } = await client
      .from('tenancies')
      .select('units!inner(id, unit_no, association_id)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .eq('units.association_id', associationId);

    units = (tenancies ?? [])
      .map((t) => t.units as unknown as { id: string; unit_no: string } | null)
      .filter((u): u is { id: string; unit_no: string } => u !== null);
  }

  return units;
}
