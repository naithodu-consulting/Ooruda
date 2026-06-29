import { FileText, IndianRupee, TrendingUp, TriangleAlert } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { BillsSection, type BillRow } from './_components/bills-section';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Billing' };

export default async function BillingPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
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

  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', association.id)
    .order('unit_no');

  const unitRows = (units ?? []) as { id: string; unit_no: string }[];
  const unitNoById = new Map(unitRows.map((u) => [u.id, u.unit_no]));

  // Generate period options: current month + 6 previous months (YYYY-MM)
  const periodOptions: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  const { data: pendingChargesRaw } = await client
    .from('pending_other_charges')
    .select('id, unit_id, period, label, amount, split_mode')
    .eq('association_id', association.id)
    .order('created_at', { ascending: false });

  const pendingCharges = (pendingChargesRaw ?? []).map((pc) => ({
    ...pc,
    unit_no: pc.unit_id ? (unitNoById.get(pc.unit_id) ?? null) : null,
  }));

  const { data: bills } = await client
    .from('bills')
    .select(
      'id, period, bill_no, total_amount, paid_amount, status, due_date, units(unit_no), bill_line_items(id, description, payer, gst_applicable, amount)',
    )
    .eq('association_id', association.id)
    .order('period', { ascending: false })
    .order('bill_no');

  const billRows: BillRow[] = (bills ?? []).map((b) => ({
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    total_amount: b.total_amount,
    paid_amount: b.paid_amount,
    status: b.status,
    due_date: b.due_date,
    unit_no: (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    lineItems: b.bill_line_items,
  }));

  const canManage = role === 'assoc_admin' || role === 'billing_operator';
  const canDelete = role === 'assoc_admin';

  const totalBilled = billRows.reduce((sum, b) => sum + b.total_amount, 0);
  const totalCollected = billRows.reduce((sum, b) => sum + b.paid_amount, 0);
  const totalOutstanding = totalBilled - totalCollected;
  const overdueCount = billRows.filter(
    (b) => displayBillStatus(b) === 'Overdue',
  ).length;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.billing" />}
        description={
          billRows.length === 0
            ? 'No bills yet'
            : `${billRows.length} bills · ${formatINR(totalCollected)} collected · ${formatINR(totalOutstanding)} outstanding`
        }
      />

      <div className="flex flex-col gap-4">
        {billRows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <MetricCard
              icon={FileText}
              label="Total billed"
              value={formatINR(totalBilled)}
              sublabel={`${billRows.length} bills`}
              variant="blue"
            />
            <MetricCard
              icon={TrendingUp}
              label="Collected"
              value={formatINR(totalCollected)}
              sublabel={
                totalBilled === 0
                  ? '0% collected'
                  : `${Math.round((totalCollected / totalBilled) * 100)}% collected`
              }
              variant="green"
            />
            <MetricCard
              icon={IndianRupee}
              label="Outstanding"
              value={formatINR(totalOutstanding)}
              sublabel="Unpaid + partial"
              variant="amber"
            />
            <MetricCard
              icon={TriangleAlert}
              label="Overdue"
              value={String(overdueCount)}
              sublabel="Bills past due"
              variant="red"
            />
          </div>
        ) : null}

        <BillsSection
          associationId={association.id}
          bills={billRows}
          canManage={canManage}
          canDelete={canDelete}
          units={unitRows}
          pendingCharges={pendingCharges}
          periodOptions={periodOptions}
        />
      </div>
    </PageBody>
  );
}
