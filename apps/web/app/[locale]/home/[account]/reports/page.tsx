import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  CollectionSummaryCard,
  type CollectionSummaryRow,
  ElectricityUsageCard,
  type ElectricityUsageRow,
  MyDuesCard,
  OutstandingDuesCard,
  type OutstandingDueRow,
} from './_components/reports-sections';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ params }: Props) {
  const { account } = await params;
  // prop_owner only sees dues for their own units; admin/operator see the
  // full association-level reports below.
  const { accountId, role, userId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
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

  if (role === 'prop_owner') {
    const { data: ownedUnits } = await client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .eq('owner_id', userId);

    const unitIds = (ownedUnits ?? []).map((u) => u.id);
    const unitNoById = new Map(
      (ownedUnits ?? []).map((u) => [u.id, u.unit_no]),
    );

    const { data: bills } =
      unitIds.length > 0
        ? await client
            .from('bills')
            .select(
              'id, period, bill_no, total_amount, paid_amount, status, due_date, unit_id',
            )
            .in('unit_id', unitIds)
            .order('period', { ascending: false })
        : { data: [] };

    const myDues: OutstandingDueRow[] = (bills ?? []).map((b) => ({
      id: b.id,
      period: b.period,
      bill_no: b.bill_no,
      unit_no: unitNoById.get(b.unit_id) ?? '—',
      total_amount: b.total_amount,
      paid_amount: b.paid_amount,
      status: b.status,
      due_date: b.due_date,
    }));

    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.reports" />}
          description={
            myDues.length === 0
              ? 'No bills yet'
              : `${myDues.length} bills across your unit(s)`
          }
        />

        <MyDuesCard bills={myDues} />
      </PageBody>
    );
  }

  const { data: allBills } = await client
    .from('bills')
    .select(
      'id, period, bill_no, total_amount, paid_amount, status, due_date, units(unit_no)',
    )
    .eq('association_id', association.id)
    .order('period', { ascending: false });

  const billRows = allBills ?? [];

  const summaryByPeriod = new Map<string, CollectionSummaryRow>();

  for (const bill of billRows) {
    const existing = summaryByPeriod.get(bill.period) ?? {
      period: bill.period,
      billed: 0,
      collected: 0,
      billCount: 0,
    };

    existing.billed += bill.total_amount;
    existing.collected += bill.paid_amount;
    existing.billCount += 1;
    summaryByPeriod.set(bill.period, existing);
  }

  const collectionSummary = Array.from(summaryByPeriod.values()).sort((a, b) =>
    b.period.localeCompare(a.period),
  );

  const outstandingDues: OutstandingDueRow[] = billRows
    .filter((b) => b.status !== 'Paid')
    .map((b) => ({
      id: b.id,
      period: b.period,
      bill_no: b.bill_no,
      unit_no:
        (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
      total_amount: b.total_amount,
      paid_amount: b.paid_amount,
      status: b.status,
      due_date: b.due_date,
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const { data: mescomBills } = await client
    .from('mescom_bills')
    .select('id, period, invoice_amount, block_consumption_units')
    .eq('association_id', association.id)
    .order('period', { ascending: false });

  const electricityUsage: ElectricityUsageRow[] = (mescomBills ?? []).map(
    (m) => ({
      id: m.id,
      period: m.period,
      invoice_amount: m.invoice_amount,
      block_consumption_units: m.block_consumption_units,
      rate:
        m.block_consumption_units > 0
          ? m.invoice_amount / m.block_consumption_units
          : null,
    }),
  );

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.reports" />}
        description={
          billRows.length === 0
            ? 'No bills yet'
            : `${collectionSummary.length} periods · ${outstandingDues.length} outstanding · ${electricityUsage.length} MESCOM bills`
        }
      />

      <div className="flex flex-col gap-6">
        <CollectionSummaryCard rows={collectionSummary} />
        <OutstandingDuesCard rows={outstandingDues} />
        <ElectricityUsageCard rows={electricityUsage} />
      </div>
    </PageBody>
  );
}
