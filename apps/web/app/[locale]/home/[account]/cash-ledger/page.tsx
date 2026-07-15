import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { CashLedgerSection } from './_components/cash-ledger-section';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Cash Ledger' };

export default async function CashLedgerPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role, userId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ]);

  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const isRestricted = role === 'prop_owner' || role === 'tenant';
  const canManage = role === 'assoc_admin' || role === 'billing_operator';
  const canDelete = role === 'assoc_admin';

  // Admin/billing_operator: all units. Owner/tenant: own unit only.
  let unitIds: string[] | null = null;

  if (isRestricted) {
    if (role === 'prop_owner') {
      const { data: ownedUnits } = await client
        .from('units')
        .select('id')
        .eq('association_id', association.id)
        .eq('owner_id', userId);
      unitIds = (ownedUnits ?? []).map((u) => u.id);
    } else {
      const { data: tenancies } = await client
        .from('tenancies')
        .select('unit_id, units!inner(association_id)')
        .eq('tenant_id', userId)
        .eq('units.association_id', association.id);
      unitIds = (tenancies ?? []).map((t) => t.unit_id);
    }
  }

  // Fetch units for the unit selector (all for admin, scoped for owner/tenant).
  let unitsQuery = client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', association.id)
    .order('unit_no');

  const filteredUnitsQuery =
    isRestricted && unitIds && unitIds.length > 0
      ? unitsQuery.in('id', unitIds)
      : unitsQuery;

  const { data: allUnits } = await filteredUnitsQuery;

  const units = (allUnits ?? []) as { id: string; unit_no: string }[];

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.cashLedger" />}
        description="Per-unit advance payments and dues ledger"
      />

      <CashLedgerSection
        associationId={association.id}
        units={units}
        canManage={canManage}
        canDelete={canDelete}
        isRestricted={isRestricted}
      />
    </PageBody>
  );
}
