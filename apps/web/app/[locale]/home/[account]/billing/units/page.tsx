import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { personLabel } from '~/lib/person-label';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';
import { UnitBillingTable } from '../_components/unit-billing-table';
import { UNIT_BILL_SELECT, type BillRow } from '../_lib/billing-queries';
import type {
  UnitBill,
  UnitDraftItem,
  UnitSummaryInput,
} from '../_lib/unit-billing-types';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    filter?: string;
    type?: string;
    duration?: string;
  }>;
}

export const metadata = { title: 'Bills by Unit · Billing' };

/**
 * Level 2: every unit, one row each, with its billed/outstanding roll-up.
 *
 * Deliberately does not join `bill_line_items`. The list renders no line-item
 * detail — that belongs to level 3, which is scoped to a single unit.
 */
export default async function BillingUnitsPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, { filter, type, duration }] = await Promise.all([
    params,
    searchParams,
  ]);

  const { accountId } = await requireRole(account, [
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

  const [
    billsResult,
    unitsResult,
    pendingChargesResult,
    pendingSinkingChargesResult,
  ] = await Promise.all([
    client
      .from('bills')
      .select(UNIT_BILL_SELECT)
      .eq('association_id', association.id)
      .order('period', { ascending: false })
      .order('bill_no'),
    client
      .from('units')
      .select(
        'id, unit_no, floor, owner_id, owner_is_company, owner_company_name, profiles(full_name, mobile_number)',
      )
      .eq('association_id', association.id)
      .order('unit_no'),
    client
      .from('pending_other_charges')
      .select('id, unit_id, period, label, amount, due_date')
      .eq('association_id', association.id)
      .eq('billed', false),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)
      .from('pending_sinking_fund_charges')
      .select('id, unit_id, period, label, amount, due_date')
      .eq('association_id', association.id)
      .eq('billed', false),
  ]);

  const unitRows = unitsResult.data ?? [];
  const unitNoById = new Map(unitRows.map((u) => [u.id, u.unit_no]));

  // profiles joined into the units query — no extra round trip.
  const unitSummaries: UnitSummaryInput[] = unitRows.map((u) => {
    const profile = (u as unknown as { profiles: { full_name: string | null; mobile_number: string | null } | null }).profiles;
    return {
      id: u.id,
      unit_no: u.unit_no,
      floor: u.floor != null ? String(u.floor) : null,
      owner_name: u.owner_is_company
        ? (u.owner_company_name ?? null)
        : u.owner_id
          ? personLabel(profile ?? null)
          : null,
    };
  });

  const rawBills = billsResult.data ?? [];

  const unitBills: UnitBill[] = rawBills.map((b) => ({
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

  // Flattened for CSV/PDF export. `unit_no` comes from the units query rather
  // than a join, keeping the bills query join-free.
  const billRows: BillRow[] = unitBills.map((b) => ({
    id: b.id,
    unit_id: b.unit_id,
    period: b.period,
    bill_no: b.bill_no,
    bill_type: b.bill_type,
    unit_no: unitNoById.get(b.unit_id) ?? '—',
    total_amount: b.total_amount,
    paid_amount: b.paid_amount,
    advance_applied: b.advance_applied,
    gst_amount: b.gst_amount,
    status: b.status,
    due_date: b.due_date,
  }));

  const drafts: UnitDraftItem[] = [
    ...(pendingChargesResult.data ?? []).map((pc) => ({
      id: pc.id,
      unit_id: pc.unit_id ?? null,
      period: pc.period,
      label: pc.label,
      amount: Number(pc.amount),
      due_date: pc.due_date ?? null,
      kind: 'other_charges' as const,
    })),
    ...(
      (pendingSinkingChargesResult.data as
        | {
            id: string;
            unit_id: string | null;
            period: string;
            label: string;
            amount: number;
            due_date: string | null;
          }[]
        | null) ?? []
    ).map((pc) => ({
      id: pc.id,
      unit_id: pc.unit_id ?? null,
      period: pc.period,
      label: pc.label,
      amount: Number(pc.amount),
      due_date: pc.due_date ?? null,
      kind: 'sinking_fund' as const,
    })),
  ];

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title="Bills by Unit"
        description="Open a unit to see its billing periods, charge types, and payment history."
      />

      <div className="mt-2 flex flex-col gap-4">
        <Link
          href={`/home/${account}/billing`}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-base transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </Link>

        <UnitBillingTable
          units={unitSummaries}
          bills={unitBills}
          billRows={billRows}
          drafts={drafts}
          initialFilter={filter}
          initialType={type}
          initialDuration={duration}
          accountSlug={account}
        />
      </div>
    </PageBody>
  );
}
