import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  BillsSection,
  type BillRow,
  type PendingElectricityBill,
} from './_components/bills-section';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ duration?: string; status?: string }>;
}

export const metadata = { title: 'Billing' };

export default async function BillingPage({ params, searchParams }: Props) {
  const [{ account }, { duration, status }] = await Promise.all([
    params,
    searchParams,
  ]);
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
  const [
    billsResult,
    unitsResult,
    otherChargesCTResult,
    pendingChargesResult,
    mescomBillsResult,
  ] = await Promise.all([
    client
      .from('bills')
      .select(
        'id, period, bill_no, bill_type, total_amount, paid_amount, status, due_date, gst_amount, units(unit_no), bill_line_items(id, description, payer, gst_applicable, amount)',
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
    client
      .from('mescom_bills')
      .select(
        'id, period, invoice_amount, block_consumption_units, uploaded_at',
      )
      .eq('association_id', association.id)
      .order('period', { ascending: false }),
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

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Generate period options for the OtherCharges dialog (last 7 months).
  const periodOptions: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  // Periods that already have generated electricity / maintenance bills.
  const generatedElecPeriods = new Set(
    (billsResult.data ?? [])
      .filter((b) => b.bill_type === 'electricity')
      .map((b) => b.period),
  );
  const generatedMaintPeriods = new Set(
    (billsResult.data ?? [])
      .filter((b) => b.bill_type === 'maintenance')
      .map((b) => b.period),
  );

  // Pending electricity: mescom_bills whose period has no generated unit bills yet.
  const pendingElectricityBills: PendingElectricityBill[] = (
    mescomBillsResult.data ?? []
  )
    .filter((mb) => !generatedElecPeriods.has(mb.period))
    .map((mb) => ({
      id: mb.id,
      period: mb.period,
      invoice_amount: Number(mb.invoice_amount),
      block_consumption_units: Number(mb.block_consumption_units),
      uploaded_at: mb.uploaded_at,
    }));

  // Pending maintenance: show current month if no maintenance bills exist yet.
  const maintenancePending = !generatedMaintPeriods.has(currentPeriod);

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
    gst_amount: b.gst_amount != null ? Number(b.gst_amount) : null,
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
        initialDuration={duration}
        initialStatus={status}
        pendingElectricityBills={pendingElectricityBills}
        maintenancePending={maintenancePending}
        currentPeriod={currentPeriod}
      />
    </PageBody>
  );
}
