import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

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

  // Fetch all independent data in parallel — no filter logic here.
  const [billsResult, unitsResult, otherChargesCTResult, pendingChargesResult] =
    await Promise.all([
      client
        .from('bills')
        .select(
          'id, period, bill_no, bill_type, total_amount, paid_amount, status, due_date, units(unit_no), bill_line_items(id, description, payer, gst_applicable, amount)',
        )
        .eq('association_id', association.id)
        .order('period', { ascending: false })
        .order('bill_no'),
      client
        .from('units')
        .select('id, unit_no')
        .eq('association_id', association.id)
        .order('unit_no'),
      client
        .from('charge_types')
        .select('is_active')
        .eq('association_id', association.id)
        .eq('key', 'other_charges')
        .maybeSingle(),
      client
        .from('pending_other_charges')
        .select('id, unit_id, period, label, amount, split_mode')
        .eq('association_id', association.id)
        .order('created_at', { ascending: false }),
    ]);

  const unitRows = (unitsResult.data ?? []) as {
    id: string;
    unit_no: string;
  }[];
  const unitNoById = new Map(unitRows.map((u) => [u.id, u.unit_no]));

  const isOtherChargesActive = otherChargesCTResult.data?.is_active ?? false;

  const pendingCharges = (pendingChargesResult.data ?? []).map((pc) => ({
    ...pc,
    unit_no: pc.unit_id ? (unitNoById.get(pc.unit_id) ?? null) : null,
  }));

  // Generate period options for the OtherCharges dialog (last 7 months).
  const periodOptions: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  const billRows: BillRow[] = (billsResult.data ?? []).map((b) => ({
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    bill_type: b.bill_type ?? 'maintenance',
    total_amount: Number(b.total_amount),
    paid_amount: Number(b.paid_amount),
    status: b.status,
    due_date: b.due_date,
    unit_no: (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    lineItems: b.bill_line_items,
  }));

  const canManage = role === 'assoc_admin' || role === 'billing_operator';
  const canDelete = role === 'assoc_admin';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.billing" />}
        description={
          billRows.length === 0 ? 'No bills yet' : `${billRows.length} bills`
        }
      />

      <BillsSection
        associationId={association.id}
        bills={billRows}
        canManage={canManage}
        canDelete={canDelete}
        units={unitRows}
        pendingCharges={pendingCharges}
        periodOptions={periodOptions}
        isOtherChargesActive={isOtherChargesActive}
        accountSlug={account}
      />
    </PageBody>
  );
}
