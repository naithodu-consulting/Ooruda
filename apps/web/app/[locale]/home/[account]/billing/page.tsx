import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { personLabel } from '~/lib/person-label';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { BillingOverview } from './_components/billing-overview';
import { BillingPeriodDetail } from './_components/billing-period-detail';
import {
  BillsSection,
  type BillRow,
  type PendingElectricityBill,
} from './_components/bills-section';
import { UnitBillingTable } from './_components/unit-billing-table';
import type {
  UnitBill,
  UnitDraftItem,
  UnitSummaryInput,
} from './_lib/unit-billing-types';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    duration?: string;
    status?: string;
    period?: string;
    bills?: string;
    unit?: string;
    filter?: string;
  }>;
}

export const metadata = { title: 'Billing' };

export default async function BillingPage({ params, searchParams }: Props) {
  const [
    { account },
    {
      duration,
      status,
      period,
      bills: billsParam,
      unit: unitParam,
      filter: filterParam,
    },
  ] = await Promise.all([params, searchParams]);
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  // isSuperAdmin gates the "Delete all bills" danger-zone action — a super
  // admin viewing an "opened workspace" resolves `role` to 'assoc_admin'
  // too, so this must be checked independently rather than via `role`.
  const [{ data: isSuperAdmin }, { data: association }] = await Promise.all([
    client.rpc('is_super_admin'),
    client
      .from('associations')
      .select('id')
      .eq('account_id', accountId)
      .single(),
  ]);

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  // Period drill-down: fast path when ?period=YYYY-MM is present.
  // Skips all heavy pending charges / mescom / deletion count queries.
  if (period) {
    const { data: periodBillsData } = await client
      .from('bills')
      .select(
        'id, period, bill_no, bill_type, total_amount, paid_amount, status, due_date, gst_amount, units(unit_no), bill_line_items(id, description, payer, gst_applicable, amount, area_sqft, rate_per_sqft)',
      )
      .eq('association_id', association.id)
      .order('period', { ascending: false })
      .order('bill_no');

    const billRows: BillRow[] = (periodBillsData ?? []).map((b) => ({
      id: b.id,
      period: b.period,
      bill_no: b.bill_no,
      bill_type: b.bill_type ?? 'maintenance',
      total_amount: Number(b.total_amount),
      paid_amount: Number(b.paid_amount),
      status: b.status,
      due_date: b.due_date,
      unit_no:
        (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
      gst_amount: b.gst_amount != null ? Number(b.gst_amount) : null,
      lineItems: b.bill_line_items,
    }));

    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.billing" />}
          description={null}
        />
        <div className="mt-2">
          <BillingPeriodDetail
            bills={billRows}
            period={period}
            accountSlug={account}
          />
        </div>
      </PageBody>
    );
  }

  // Fetch all independent data in parallel — no filter logic here.
  const [
    billsResult,
    unitsResult,
    otherChargesCTResult,
    sinkingFundCTResult,
    pendingChargesResult,
    pendingSinkingChargesResult,
    mescomBillsResult,
    cashLedgerResult,
  ] = await Promise.all([
    client
      .from('bills')
      .select(
        'id, unit_id, period, bill_no, bill_type, total_amount, paid_amount, advance_applied, status, due_date, gst_amount, pdf_url, units(unit_no), bill_line_items(id, description, payer, gst_applicable, amount, area_sqft, rate_per_sqft)',
      )
      .eq('association_id', association.id)
      .order('period', { ascending: false })
      .order('bill_no'),
    client
      .from('units')
      .select(
        'id, unit_no, floor, owner_id, owner_is_company, owner_company_name',
      )
      .eq('association_id', association.id)
      .order('unit_no'),
    client
      .from('charge_types')
      .select('is_active')
      .eq('association_id', association.id)
      .eq('key', 'other_charges')
      .maybeSingle(),
    client
      .from('charge_types')
      .select('is_active')
      .eq('association_id', association.id)
      .eq('key', 'sinking_fund')
      .maybeSingle(),
    client
      .from('pending_other_charges')
      .select(
        'id, unit_id, period, label, amount, split_mode, due_date, billed',
      )
      .eq('association_id', association.id)
      .eq('billed', false)
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)
      .from('pending_sinking_fund_charges')
      .select(
        'id, unit_id, period, label, amount, split_mode, due_date, billed',
      )
      .eq('association_id', association.id)
      .eq('billed', false)
      .order('created_at', { ascending: false }),
    client
      .from('mescom_bills')
      .select(
        'id, period, invoice_amount, block_consumption_units, uploaded_at',
      )
      .eq('association_id', association.id)
      .order('period', { ascending: false }),
    // Net cash-ledger position per unit. Fetched as raw entries and summed
    // here rather than via get_cash_ledger_balance(), which is scoped to a
    // single unit+bill_type and would mean ~180 round trips for 30 units.
    client
      .from('cash_ledger')
      .select('unit_id, direction, amount')
      .eq('association_id', association.id),
  ]);

  // Only fetch these counts for super admins — they drive the danger-zone
  // "Delete all bills" summary and would be wasted work for everyone else.
  let deletionCounts: {
    bills: number;
    payments: number;
    receipts: number;
  } | null = null;
  if (isSuperAdmin) {
    const [{ count: paymentsCount }, { count: receiptsCount }] =
      await Promise.all([
        client
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('association_id', association.id),
        client
          .from('receipts')
          .select('id, payments!inner(association_id)', {
            count: 'exact',
            head: true,
          })
          .eq('payments.association_id', association.id),
      ]);
    deletionCounts = {
      bills: billsResult.data?.length ?? 0,
      payments: paymentsCount ?? 0,
      receipts: receiptsCount ?? 0,
    };
  }

  const unitRows = (unitsResult.data ?? []) as {
    id: string;
    unit_no: string;
    floor: number | null;
    owner_id: string | null;
    owner_is_company: boolean;
    owner_company_name: string | null;
  }[];
  const unitNoById = new Map(unitRows.map((u) => [u.id, u.unit_no]));

  // Owner names for the unit-centric table. Individual owners resolve through
  // `profiles`; company-owned units carry their name on the unit itself.
  const ownerIds = [
    ...new Set(
      unitRows.map((u) => u.owner_id).filter((id): id is string => !!id),
    ),
  ];

  let ownerProfiles: Record<
    string,
    { full_name: string | null; mobile_number: string | null }
  > = {};

  if (ownerIds.length > 0) {
    const { data: profileRows } = await client
      .from('profiles')
      .select('id, full_name, mobile_number')
      .in('id', ownerIds);

    ownerProfiles = Object.fromEntries(
      (profileRows ?? []).map((p) => [
        p.id,
        { full_name: p.full_name, mobile_number: p.mobile_number },
      ]),
    );
  }

  const isOtherChargesActive = otherChargesCTResult.data?.is_active ?? false;
  const isSinkingFundActive = sinkingFundCTResult.data?.is_active ?? false;

  const pendingCharges = (pendingChargesResult.data ?? []).map((pc) => ({
    ...pc,
    unit_no: pc.unit_id ? (unitNoById.get(pc.unit_id) ?? null) : null,
  }));

  const pendingSinkingCharges = (
    (pendingSinkingChargesResult.data as Array<{
      id: string;
      unit_id: string | null;
      period: string;
      label: string;
      amount: number;
      split_mode: string | null;
      due_date: string | null;
      billed: boolean;
    }>) ?? []
  ).map((pc) => ({
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

  // ── Unit-centric view data ─────────────────────────────────────────────────
  // The table below is keyed on units, not bills: every unit gets a row whether
  // or not it has been billed, and periods/types unfold inside it.

  // Positive net = the unit is carrying an advance/credit; negative or zero
  // means nothing to surface, so those are clamped away.
  const advanceByUnit = new Map<string, number>();
  for (const entry of cashLedgerResult.data ?? []) {
    if (!entry.unit_id) continue;
    const delta =
      entry.direction === 'credit'
        ? Number(entry.amount)
        : -Number(entry.amount);
    advanceByUnit.set(
      entry.unit_id,
      (advanceByUnit.get(entry.unit_id) ?? 0) + delta,
    );
  }

  const unitSummaries: UnitSummaryInput[] = unitRows.map((u) => ({
    id: u.id,
    unit_no: u.unit_no,
    floor: u.floor != null ? String(u.floor) : null,
    owner_name: u.owner_is_company
      ? (u.owner_company_name ?? null)
      : u.owner_id
        ? personLabel(ownerProfiles[u.owner_id])
        : null,
    advance_balance: Math.max(0, advanceByUnit.get(u.id) ?? 0),
  }));

  const unitBills: UnitBill[] = (billsResult.data ?? []).map((b) => ({
    id: b.id,
    unit_id: b.unit_id,
    period: b.period,
    bill_no: b.bill_no,
    bill_type: b.bill_type ?? 'maintenance',
    total_amount: Number(b.total_amount),
    paid_amount: Number(b.paid_amount),
    advance_applied: b.advance_applied != null ? Number(b.advance_applied) : 0,
    gst_amount: b.gst_amount != null ? Number(b.gst_amount) : null,
    status: b.status,
    due_date: b.due_date,
    pdf_url: b.pdf_url ?? null,
  }));

  const unitDrafts: UnitDraftItem[] = [
    ...pendingCharges.map((pc) => ({
      id: pc.id,
      unit_id: pc.unit_id ?? null,
      period: pc.period,
      label: pc.label,
      amount: Number(pc.amount),
      due_date: pc.due_date ?? null,
      kind: 'other_charges' as const,
    })),
    ...pendingSinkingCharges.map((pc) => ({
      id: pc.id,
      unit_id: pc.unit_id ?? null,
      period: pc.period,
      label: pc.label,
      amount: Number(pc.amount),
      due_date: pc.due_date ?? null,
      kind: 'sinking_fund' as const,
    })),
  ];

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

      <div className="mt-2 space-y-8">
        <BillingOverview bills={billRows} accountSlug={account} />

        <div className="border-t pt-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Bills by Unit</h2>
              <p className="text-muted-foreground text-xs">
                Expand a unit to see its billing periods, charge types, and
                payment history.
              </p>
            </div>
          </div>

          <UnitBillingTable
            units={unitSummaries}
            bills={unitBills}
            drafts={unitDrafts}
            initialUnitNo={unitParam}
            initialFilter={filterParam}
            accountSlug={account}
          />
        </div>

        <div className="border-t pt-4">
          <BillsSection
            associationId={association.id}
            bills={billRows}
            canManage={canManage}
            canDelete={canDelete}
            isSuperAdmin={!!isSuperAdmin}
            deletionCounts={deletionCounts}
            units={unitRows}
            pendingCharges={pendingCharges}
            periodOptions={periodOptions}
            isOtherChargesActive={isOtherChargesActive}
            isSinkingFundActive={isSinkingFundActive}
            pendingSinkingCharges={pendingSinkingCharges}
            accountSlug={account}
            initialDuration={duration}
            initialStatus={status}
            pendingElectricityBills={pendingElectricityBills}
            maintenancePending={maintenancePending}
            currentPeriod={currentPeriod}
            defaultOpen={billsParam === 'draft' || billsParam === 'open'}
            initialTab={billsParam === 'draft' ? 'draft' : undefined}
          />
        </div>
      </div>
    </PageBody>
  );
}
