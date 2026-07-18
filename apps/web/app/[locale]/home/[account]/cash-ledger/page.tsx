import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { CashLedgerSection } from './_components/cash-ledger-section';
import type { CashLedgerEntryRow } from './_lib/cash-ledger-actions';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Cash Ledger' };

function currentFYDates(): { from: string; to: string } {
  const now = new Date();
  const fyStartYear =
    now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: `${fyStartYear}-04-01`,
    to: `${fyStartYear + 1}-03-31`,
  };
}

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

  const { from: defaultDateFrom, to: defaultDateTo } = currentFYDates();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uc = (c: unknown) => c as any;

  const [{ data: allUnits }, { data: initialData }] = await Promise.all([
    client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .order('unit_no'),
    // Direct query — requireRole already authenticated; no extra auth re-check.
    // Scoped to current FY so the initial load is fast.
    uc(client)
      .from('cash_ledger')
      .select(
        'id, unit_id, entry_type, bill_type, amount, direction, entry_date, paid_by_name, notes, created_at, reference_bill_id',
      )
      .eq('association_id', association.id)
      .gte('entry_date', defaultDateFrom)
      .lte('entry_date', defaultDateTo)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  const units = (allUnits ?? []) as { id: string; unit_no: string }[];
  const initialEntries = (initialData ?? []) as CashLedgerEntryRow[];

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
        defaultDateFrom={defaultDateFrom}
        defaultDateTo={defaultDateTo}
      />
    </PageBody>
  );
}
