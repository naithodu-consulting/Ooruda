import { Building2, DoorOpen } from 'lucide-react';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Card, CardContent } from '@kit/ui/card';

import { getDurationItems } from '~/lib/bill-filter-items';
import { getPeriodsForDuration } from '~/lib/bill-period-filter';
import { displayBillStatus } from '~/lib/bill-status';
import { daysBetweenYmd, todayInBillingZone } from '~/lib/billing-dates';
import { loadUnitLedgerBalances } from '~/lib/cash-ledger-aggregation';
import { formatPeriod } from '~/lib/format-period';
import { type PropOpsRole, hasMinimumRole } from '~/lib/rbac';

import {
  AdminOverviewPanel,
  type OverviewMetrics,
  type StaticOverviewData,
} from './admin-overview-panel';
import { OwnerUnitsView } from './owner-units-view';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function overviewPeriodDisplay(
  duration: string,
  periods: string[] | null,
): string {
  if (!periods || periods.length === 0) return 'All time';
  const items = getDurationItems();
  if (duration === 'this_fy') return items.this_fy;
  if (duration === 'prev_fy') return items.prev_fy;
  if (periods.length === 1) return formatPeriod(periods[0]!);
  const sorted = [...periods].sort();
  const startDate = new Date(sorted[0]! + '-01');
  const endDate = new Date(sorted[sorted.length - 1]! + '-01');
  const startMonth = startDate.toLocaleString('en-IN', { month: 'short' });
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startMonth}–${endDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
  }
  return `${startDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}–${endDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
}

/** Compute bill metrics for a single duration from raw bill rows. */
function computeBillMetrics(
  duration: string,
  bills: {
    total_amount: number;
    paid_amount: number;
    advance_applied: number;
    status: string;
    due_date: string;
  }[],
  today: string,
): OverviewMetrics {
  const periods = getPeriodsForDuration(duration);
  const billed = bills.reduce((sum, b) => sum + b.total_amount, 0);
  // collected = cash paid + advance applied (total settled amount, same basis as outstanding)
  const collected = bills.reduce(
    (sum, b) => sum + b.paid_amount + Number(b.advance_applied ?? 0),
    0,
  );
  // outstanding must subtract advance_applied — same formula as per-bill outstanding
  const outstanding = bills.reduce(
    (sum, b) =>
      sum +
      Math.max(
        0,
        b.total_amount - b.paid_amount - Number(b.advance_applied ?? 0),
      ),
    0,
  );

  const overdueBills = bills.filter((b) => displayBillStatus(b) === 'Overdue');
  const overdueCount = overdueBills.length;
  const overdueAmount = overdueBills.reduce(
    (sum, b) =>
      sum +
      Math.max(
        0,
        b.total_amount - b.paid_amount - Number(b.advance_applied ?? 0),
      ),
    0,
  );

  const ageing = { d0to7: 0, d8to30: 0, d30plus: 0 };
  for (const bill of bills) {
    const outstandingAmount = Math.max(
      0,
      bill.total_amount - bill.paid_amount - Number(bill.advance_applied ?? 0),
    );
    if (outstandingAmount <= 0) continue;
    const daysOverdue = daysBetweenYmd(bill.due_date, today);
    if (daysOverdue <= 0) continue;
    if (daysOverdue <= 7) ageing.d0to7 += outstandingAmount;
    else if (daysOverdue <= 30) ageing.d8to30 += outstandingAmount;
    else ageing.d30plus += outstandingAmount;
  }

  return {
    periodDisplay: overviewPeriodDisplay(duration, periods),
    billsGenerated: bills.length,
    billed,
    collected,
    outstanding,
    overdueCount,
    overdueAmount,
    ageing,
  };
}

async function loadAdminOverview(associationId: string) {
  const client = getSupabaseServerClient();
  const currentMonth = currentPeriod();
  const today = todayInBillingZone();

  const allDurations = Object.keys(getDurationItems());

  // Fetch static data + bills for every duration in one parallel batch.
  const [
    { count: totalUnits },
    { count: occupiedUnits },
    { data: mescomBill },
    { data: recentActivity },
    ...billResults
  ] = await Promise.all([
    client
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', associationId)
      .neq('type', 'Common Area'),
    client
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', associationId)
      .neq('type', 'Common Area')
      .in('status', ['Self Occupied', 'Rented']),
    client
      .from('mescom_bills')
      .select('id')
      .eq('association_id', associationId)
      .eq('period', currentMonth)
      .maybeSingle(),
    client
      .from('audit_logs')
      .select('action, summary, created_at')
      .eq('association_id', associationId)
      .not('action', 'ilike', '%failed%')
      .not('action', 'ilike', '%error%')
      .not('summary', 'ilike', 'Failed%')
      .order('created_at', { ascending: false })
      .limit(5),
    // One bills query per duration (7 queries, all in parallel).
    ...allDurations.map((dur) => {
      let q = client
        .from('bills')
        .select('total_amount, paid_amount, advance_applied, status, due_date')
        .eq('association_id', associationId)
        .neq('status', 'Void');
      const periods = getPeriodsForDuration(dur);
      if (periods) q = q.in('period', periods);
      return q;
    }),
  ]);

  const staticData: StaticOverviewData = {
    totalUnits: totalUnits ?? 0,
    occupiedUnits: occupiedUnits ?? 0,
    mescomBillUploaded: Boolean(mescomBill),
    currentMonth,
    recentActivity: (recentActivity ??
      []) as StaticOverviewData['recentActivity'],
  };

  const metricsByDuration: Record<string, OverviewMetrics> = {};
  allDurations.forEach((dur, i) => {
    const bills = (billResults[i]?.data ?? []) as {
      total_amount: number;
      paid_amount: number;
      advance_applied: number;
      status: string;
      due_date: string;
    }[];
    metricsByDuration[dur] = computeBillMetrics(dur, bills, today);
  });

  return { staticData, metricsByDuration };
}

interface BillWithLineItems {
  id: string;
  bill_no: string;
  bill_type: string;
  period: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  unit_id: string;
  bill_line_items: { amount: number; description: string }[];
}

interface PaymentWithBillAndReceipt {
  id: string;
  amount: number;
  mode: string;
  paid_at: string;
  bill_id: string;
  bills: { period: string; bill_no: string } | null;
  // payments -> receipts is to-one: receipts.payment_id is unique.
  receipts: { receipt_no: string } | null;
}

interface DuePaymentRow {
  id: string;
  unit_id: string;
  bill_type: string;
  amount: number;
  mode: string;
  paid_at: string;
  receipt_no: string | null;
}

interface AdvancePaymentRow {
  id: string;
  unit_id: string;
  bill_type: string;
  amount: number;
  entry_date: string;
  razorpay_payment_id: string | null;
}

async function loadMyBillSummary(
  accountId: string,
  associationId: string,
  assocName: string,
  userId: string,
) {
  const client = getSupabaseServerClient();

  // Resolve owned vs rented separately (rather than via getAccessibleUnits'
  // collapsed list) because the two need different bill scoping: owned
  // units show every bill ever generated, but rented units must only show
  // bills attributed to THIS tenancy — otherwise a new tenant on a unit
  // would see every past tenant's bill/payment history on that unit.
  const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
    client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', associationId)
      .eq('owner_id', userId)
      .order('unit_no'),
    client
      .from('tenancies')
      .select('id, unit_id, units!inner(id, unit_no, association_id)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .eq('units.association_id', associationId),
  ]);

  const rentedTenancies = tenancies ?? [];
  const myTenancyIds = rentedTenancies.map((t) => t.id);

  // Mirror getAccessibleUnits' fallback: owners see their owned units;
  // a user with no owned units falls back to their rented units.
  const usingOwned = (ownedUnits ?? []).length > 0;
  const units: { id: string; unit_no: string }[] = usingOwned
    ? (ownedUnits ?? [])
    : rentedTenancies
        .map(
          (t) => t.units as unknown as { id: string; unit_no: string } | null,
        )
        .filter((u): u is { id: string; unit_no: string } => u !== null);

  if (units.length === 0) {
    return null;
  }

  const unitIds = units.map((u) => u.id);

  // Fetch bills for these units, newest period first, with line items.
  // Owned units: unrestricted. Rented units: scoped to this tenant's own
  // tenancy (or bills predating any tenancy, which no tenant was billed for).
  let billsQuery = client
    .from('bills')
    .select(`
      id,
      bill_no,
      bill_type,
      period,
      total_amount,
      paid_amount,
      status,
      due_date,
      unit_id,
      bill_line_items (
        amount,
        description
      )
    `)
    .in('unit_id', unitIds)
    .order('period', { ascending: false })
    .order('bill_no', { ascending: false });

  if (!usingOwned) {
    billsQuery =
      myTenancyIds.length > 0
        ? billsQuery.or(
            `tenancy_id.is.null,tenancy_id.in.(${myTenancyIds.join(',')})`,
          )
        : billsQuery.is('tenancy_id', null);
  }

  // Void bills are cancelled — owners and tenants should never see them
  // as active items in their dashboard.
  billsQuery = billsQuery.neq('status', 'Void');

  const { data: allBills } = await billsQuery;

  const bills = (allBills as unknown as BillWithLineItems[]) ?? [];

  // Fetch payments for these bills
  const billIds = bills.map((b) => b.id);
  let payments: PaymentWithBillAndReceipt[] = [];
  if (billIds.length > 0) {
    const { data: paymentsData } = await client
      .from('payments')
      .select(`
        id,
        amount,
        mode,
        paid_at,
        bill_id,
        bills (
          period,
          bill_no
        ),
        receipts (
          receipt_no
        )
      `)
      .in('bill_id', billIds)
      .order('paid_at', { ascending: false });
    payments = (paymentsData as unknown as PaymentWithBillAndReceipt[]) ?? [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uc = (c: unknown) => c as any;
  const [ledgerBalances, duePaymentsResult, advancePaymentsResult] =
    await Promise.all([
      loadUnitLedgerBalances(associationId, units),
      uc(client)
        .from('cash_ledger_payments')
        .select('id, unit_id, bill_type, amount, mode, paid_at, receipt_no')
        .in('unit_id', unitIds)
        .eq('association_id', associationId)
        .order('paid_at', { ascending: false }),
      uc(client)
        .from('cash_ledger')
        .select('id, unit_id, bill_type, amount, entry_date, razorpay_payment_id')
        .in('unit_id', unitIds)
        .eq('association_id', associationId)
        .eq('entry_type', 'advance_payment')
        .order('entry_date', { ascending: false }),
    ]);

  const duePayments: DuePaymentRow[] =
    (duePaymentsResult.data as DuePaymentRow[] | null) ?? [];
  const advancePayments: AdvancePaymentRow[] =
    (advancePaymentsResult.data as AdvancePaymentRow[] | null) ?? [];

  return {
    units,
    bills,
    payments,
    duePayments,
    advancePayments,
    assocName,
    ledgerBalances,
  };
}

export async function AssociationDashboard({
  account,
  accountId,
  associationId,
  associationStatus: _associationStatus,
  assocName,
  userId,
  role,
  duration = 'current_month',
}: {
  account: string;
  accountId: string;
  associationId: string;
  associationStatus: string;
  assocName: string;
  userId: string;
  role: PropOpsRole;
  duration?: string;
}) {
  const isPersonal = role === 'prop_owner' || role === 'tenant';

  if (isPersonal) {
    const admin = getSupabaseServerAdminClient();
    const [summary, { data: gateway }] = await Promise.all([
      loadMyBillSummary(accountId, associationId, assocName, userId),
      admin
        .from('association_payment_gateways')
        .select('is_active')
        .eq('association_id', associationId)
        .maybeSingle(),
    ]);

    if (!summary) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <DoorOpen className="text-muted-foreground h-10 w-10" />
            <p className="text-muted-foreground text-sm">
              You don't have a unit assigned yet. Your association admin can set
              this up for you.
            </p>
          </CardContent>
        </Card>
      );
    }

    const { units, bills, payments, duePayments, advancePayments, ledgerBalances } = summary;

    return (
      <OwnerUnitsView
        account={account}
        role={role as 'prop_owner' | 'tenant'}
        assocName={assocName}
        associationId={associationId}
        canPay={gateway?.is_active ?? false}
        units={units}
        bills={bills as Parameters<typeof OwnerUnitsView>[0]['bills']}
        payments={payments as Parameters<typeof OwnerUnitsView>[0]['payments']}
        duePayments={duePayments}
        advancePayments={advancePayments}
        ledgerBalances={ledgerBalances}
      />
    );
  }

  const canManage = hasMinimumRole(role, 'billing_operator');
  const { staticData, metricsByDuration } =
    await loadAdminOverview(associationId);

  if (canManage && staticData.totalUnits === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Building2 className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground max-w-sm text-sm">
            No units yet. Once you add your shops and offices, their billing and
            occupancy will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <AdminOverviewPanel
      account={account}
      initialDuration={duration}
      metricsByDuration={metricsByDuration}
      staticData={staticData}
    />
  );
}
