import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Badge } from '@kit/ui/badge';
import { PageBody } from '@kit/ui/page';

import { billStatusBadgeClassName } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { personLabel } from '~/lib/person-label';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../../../_components/team-account-layout-page-header';
import { UnitBillingDetail } from '../../_components/unit-detail-tree';
import { UNIT_BILL_SELECT } from '../../_lib/billing-queries';
import {
  buildUnitTree,
  UNIT_STATUS_LABEL,
  type UnitBill,
  type UnitDraftItem,
} from '../../_lib/unit-billing-types';

interface Props {
  params: Promise<{ account: string; unitId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { account, unitId } = await params;
  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id, accounts!inner(slug)')
    .eq('accounts.slug', account)
    .maybeSingle();

  if (!association) return { title: 'Unit · Billing' };

  const { data: unit } = await client
    .from('units')
    .select('unit_no')
    .eq('id', unitId)
    .eq('association_id', association.id)
    .maybeSingle();

  return { title: unit ? `Unit ${unit.unit_no} · Billing` : 'Unit · Billing' };
}

/**
 * Level 3: one unit's complete billing history.
 *
 * Every query here is scoped by `unit_id`, which is the whole point of the
 * route — the previous single-page design had to load every bill for the
 * association just in case a row was expanded.
 */
export default async function UnitBillingPage({ params }: Props) {
  const { account, unitId } = await params;
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

  // Scoped by association_id as well as id — a unit belonging to another
  // association must read as missing, not as forbidden.
  const { data: unit } = await client
    .from('units')
    .select(
      'id, unit_no, floor, owner_id, owner_is_company, owner_company_name',
    )
    .eq('id', unitId)
    .eq('association_id', association.id)
    .maybeSingle();

  if (!unit) notFound();

  const [billsResult, pendingChargesResult, pendingSinkingChargesResult] =
    await Promise.all([
      client
        .from('bills')
        .select(UNIT_BILL_SELECT)
        .eq('association_id', association.id)
        .eq('unit_id', unitId)
        .order('period', { ascending: false })
        .order('bill_no'),
      client
        .from('pending_other_charges')
        .select('id, unit_id, period, label, amount, due_date')
        .eq('association_id', association.id)
        .eq('unit_id', unitId)
        .eq('billed', false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any)
        .from('pending_sinking_fund_charges')
        .select('id, unit_id, period, label, amount, due_date')
        .eq('association_id', association.id)
        .eq('unit_id', unitId)
        .eq('billed', false),
    ]);

  let ownerName: string | null = unit.owner_is_company
    ? (unit.owner_company_name ?? null)
    : null;

  if (!unit.owner_is_company && unit.owner_id) {
    const { data: profile } = await client
      .from('profiles')
      .select('full_name, mobile_number')
      .eq('id', unit.owner_id)
      .maybeSingle();
    ownerName = personLabel(profile ?? undefined);
  }

  const bills: UnitBill[] = (billsResult.data ?? []).map((b) => ({
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

  // Reuse the same roll-up the list uses, so a unit's totals here always match
  // the row it was opened from.
  const node = buildUnitTree(
    [
      {
        id: unit.id,
        unit_no: unit.unit_no,
        floor: unit.floor != null ? String(unit.floor) : null,
        owner_name: ownerName,
      },
    ],
    bills,
    drafts,
  )[0]!;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={`Unit ${unit.unit_no}`}
        description={ownerName ?? 'Vacant'}
      />

      <div className="mt-2 flex flex-col gap-4">
        <Link
          href={`/home/${account}/billing/units`}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-base transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Bills by Unit
        </Link>

        {/* Summary strip — chips matching the Payments page metrics pattern */}
        <div className="flex flex-wrap items-center gap-2">
          <Stat label="Billed" value={formatINR(node.billed)} />
          <Stat label="Collected" value={formatINR(node.collected)} />
          <Stat
            label="Outstanding"
            value={node.outstanding > 0 ? formatINR(node.outstanding) : '—'}
            tone={node.outstanding > 0 ? 'warning' : undefined}
          />
          {node.overdueCount > 0 && (
            <Stat
              label="Overdue Bills"
              value={String(node.overdueCount)}
              tone="danger"
            />
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-muted-foreground text-sm">Status:</span>
            <Badge
              variant="outline"
              className={`text-sm ${
                node.status === 'all_paid'
                  ? (billStatusBadgeClassName('Paid') ?? '')
                  : node.status === 'partial'
                    ? (billStatusBadgeClassName('Partial') ?? '')
                    : node.status === 'overdue'
                      ? (billStatusBadgeClassName('Overdue') ?? '')
                      : 'border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {UNIT_STATUS_LABEL[node.status]}
            </Badge>
          </div>
        </div>

        <div className="bg-card overflow-hidden rounded-xl border">
          <UnitBillingDetail
            periods={node.periods}
            drafts={node.drafts}
            canVoid={role === 'assoc_admin'}
            associationId={association.id}
          />
        </div>
      </div>
    </PageBody>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger' | 'info';
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-[var(--color-warning)]'
      : tone === 'danger'
        ? 'text-destructive'
        : tone === 'info'
          ? 'text-[var(--color-info)]'
          : 'text-foreground';

  return (
    <div className="bg-muted/50 flex flex-col items-center rounded-md px-3 py-2 text-center">
      <span className={`text-base font-semibold tabular-nums ${toneClass}`}>
        {value}
      </span>
      <span className="text-muted-foreground text-[13px] font-medium">
        {label}
      </span>
    </div>
  );
}
