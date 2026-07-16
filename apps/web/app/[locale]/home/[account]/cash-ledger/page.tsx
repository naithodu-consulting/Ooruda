import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { CashLedgerSection } from './_components/cash-ledger-section';
import { getCashLedgerEntriesAction } from './_lib/cash-ledger-actions';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Cash Ledger' };

export default async function CashLedgerPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ]);

  // Owners and tenants see their balance on the dashboard and Payments page.
  // The Cash Ledger is an admin/operator tool — redirect them away.
  if (role === 'prop_owner' || role === 'tenant') {
    redirect(`/home/${account}/payments`);
  }

  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const canManage = role === 'assoc_admin' || role === 'billing_operator';
  const canDelete = role === 'assoc_admin';

  const [{ data: allUnits }, initialResult] = await Promise.all([
    client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .order('unit_no'),
    // Prefetch default view (all units, all types, no date filter) so the
    // table renders immediately without a client-side waterfall on load.
    getCashLedgerEntriesAction(association.id, 'all', 'all'),
  ]);

  const units = (allUnits ?? []) as { id: string; unit_no: string }[];
  const initialEntries = initialResult.entries ?? [];

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
        initialEntries={initialEntries}
      />
    </PageBody>
  );
}
