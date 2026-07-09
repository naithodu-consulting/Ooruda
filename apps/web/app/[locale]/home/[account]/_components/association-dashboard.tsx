import Link from 'next/link';

import {
  AlertTriangle,
  Banknote,
  Building2,
  Clock,
  DoorOpen,
  Receipt,
  Zap,
} from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { alertExtras } from '@kit/ui/alert-extras';
import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { MetricCard } from '@kit/ui/metric-card';

import { DownloadPdfButton } from '~/components/download-pdf-button';
import { getDurationItems } from '~/lib/bill-filter-items';
import { getPeriodsForDuration } from '~/lib/bill-period-filter';
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { daysBetweenYmd, todayInBillingZone } from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';
import { type PropOpsRole, hasMinimumRole } from '~/lib/rbac';
import { getAccessibleUnits } from '~/lib/unit-access';

import { DashboardDurationSelect } from './dashboard-duration-select';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const periodLabel = formatPeriod;

function overviewPeriodDisplay(
  duration: string,
  periods: string[] | null,
): string {
  if (!periods || periods.length === 0) return 'All time';
  const items = getDurationItems();
  if (duration === 'this_fy') return items.this_fy;
  if (duration === 'prev_fy') return items.prev_fy;
  if (periods.length === 1) return periodLabel(periods[0]!);
  const sorted = [...periods].sort();
  const startDate = new Date(sorted[0]! + '-01');
  const endDate = new Date(sorted[sorted.length - 1]! + '-01');
  const startMonth = startDate.toLocaleString('en-IN', { month: 'short' });
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startMonth}–${endDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
  }
  return `${startDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}–${endDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
}

function AgeingBar(props: {
  label: string;
  amount: number;
  maxAmount: number;
  colorClassName: string;
  textClassName: string;
}) {
  const width =
    props.maxAmount > 0
      ? `${Math.max(4, (props.amount / props.maxAmount) * 100)}%`
      : '0%';

  return (
    <div>
      <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-xs font-semibold">
        <span>{props.label}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${props.colorClassName}`}
          style={{ width }}
        />
      </div>
      <p className={`mt-1 text-sm font-semibold ${props.textClassName}`}>
        {formatINR(props.amount)}
      </p>
    </div>
  );
}

async function loadAssociationOverview(accountId: string, duration: string) {
  const client = getSupabaseServerClient();
  const currentMonth = currentPeriod();
  const periods = getPeriodsForDuration(duration);

  const { data: association } = await client
    .from('associations')
    .select('id, status')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    return null;
  }

  let billsQuery = client
    .from('bills')
    .select('total_amount, paid_amount, status, due_date')
    .eq('association_id', association.id);
  if (periods) {
    billsQuery = billsQuery.in('period', periods);
  }

  const [
    { count: totalUnits },
    { count: occupiedUnits },
    { data: bills },
    { data: mescomBill },
  ] = await Promise.all([
    client
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', association.id),
    client
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', association.id)
      .in('status', ['Self Occupied', 'Rented']),
    billsQuery,
    client
      .from('mescom_bills')
      .select('id')
      .eq('association_id', association.id)
      .eq('period', currentMonth)
      .maybeSingle(),
  ]);

  const billed = (bills ?? []).reduce((sum, b) => sum + b.total_amount, 0);
  const collected = (bills ?? []).reduce((sum, b) => sum + b.paid_amount, 0);
  const outstanding = billed - collected;
  const overdueBills = (bills ?? []).filter(
    (b) => displayBillStatus(b) === 'Overdue',
  );
  const overdueCount = overdueBills.length;
  const overdueAmount = overdueBills.reduce(
    (sum, b) => sum + (b.total_amount - b.paid_amount),
    0,
  );

  const ageing = { d0to7: 0, d8to30: 0, d30plus: 0 };
  const today = todayInBillingZone();

  for (const bill of bills ?? []) {
    const outstandingAmount = bill.total_amount - bill.paid_amount;

    if (outstandingAmount <= 0) {
      continue;
    }

    const daysOverdue = daysBetweenYmd(bill.due_date, today);

    if (daysOverdue <= 0) {
      continue;
    } else if (daysOverdue <= 7) {
      ageing.d0to7 += outstandingAmount;
    } else if (daysOverdue <= 30) {
      ageing.d8to30 += outstandingAmount;
    } else {
      ageing.d30plus += outstandingAmount;
    }
  }

  const { data: recentActivity } = await client
    .from('audit_logs')
    .select('action, summary, created_at')
    .eq('association_id', association.id)
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    status: association.status,
    currentMonth,
    periodDisplay: overviewPeriodDisplay(duration, periods),
    totalUnits: totalUnits ?? 0,
    occupiedUnits: occupiedUnits ?? 0,
    billsGenerated: bills?.length ?? 0,
    billed,
    collected,
    outstanding,
    overdueCount,
    overdueAmount,
    ageing,
    mescomBillUploaded: Boolean(mescomBill),
    recentActivity: recentActivity ?? [],
  };
}

interface BillWithLineItems {
  id: string;
  bill_no: string;
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

async function loadMyBillSummary(accountId: string, userId: string) {
  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id, accounts(name)')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    return null;
  }

  const assocName = (association.accounts as any)?.name ?? 'Association';

  const units = await getAccessibleUnits(client, association.id, userId);

  if (units.length === 0) {
    return null;
  }

  // Fetch ALL bills for ALL owned units, newest period first, with line items
  const unitIds = units.map((u) => u.id);
  const { data: allBills } = await client
    .from('bills')
    .select(`
      id,
      bill_no,
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
    .order('period', { ascending: false });

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
      .order('paid_at', { ascending: false })
      .limit(10);
    payments = (paymentsData as unknown as PaymentWithBillAndReceipt[]) ?? [];
  }

  return {
    units,
    bills,
    payments,
    assocName,
  };
}

export async function AssociationDashboard({
  account,
  accountId,
  userId,
  role,
  duration = 'current_month',
}: {
  account: string;
  accountId: string;
  userId: string;
  role: PropOpsRole;
  duration?: string;
}) {
  const isPersonal = role === 'prop_owner' || role === 'tenant';

  if (isPersonal) {
    const summary = await loadMyBillSummary(accountId, userId);

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

    const { units, bills, payments, assocName } = summary;

    return (
      <div className="flex flex-col gap-8">
        {/* Page Header (Rendered once at the top) */}
        <div className="flex flex-col">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {role === 'prop_owner' ? 'Owner Dashboard' : 'Tenant Dashboard'}
          </h1>
          <p className="text-muted-foreground text-sm">{assocName}</p>
        </div>

        {units.map((unit, index) => {
          const unitBills = bills.filter((b) => b.unit_id === unit.id);
          const unitPayments = payments.filter((p) =>
            unitBills.some((b) => b.id === p.bill_id),
          );

          // All unpaid/partial bills across ALL periods
          const unpaidBills = unitBills.filter(
            (b) =>
              b.status === 'Unpaid' ||
              b.status === 'Partial' ||
              b.status === 'Overdue',
          );

          // Total outstanding across every period
          const totalOutstanding = unpaidBills.reduce(
            (sum, b) => sum + Math.max(0, b.total_amount - b.paid_amount),
            0,
          );

          // Determine worst-case status across all unpaid bills
          const hasOverdue = unpaidBills.some(
            (b) => displayBillStatus(b) === 'Overdue',
          );
          const overallStatus = hasOverdue
            ? 'Overdue'
            : unpaidBills.length > 0
              ? 'Unpaid'
              : 'Paid';

          // Group unpaid bills by period for the card breakdown
          const unpaidByPeriod = new Map<string, number>();
          for (const b of unpaidBills) {
            const amt = Math.max(0, b.total_amount - b.paid_amount);
            unpaidByPeriod.set(
              b.period,
              (unpaidByPeriod.get(b.period) ?? 0) + amt,
            );
          }
          // Sorted newest first
          const periodBreakdown = Array.from(unpaidByPeriod.entries()).sort(
            ([a], [b]) => b.localeCompare(a),
          );

          const latestPeriod = periodBreakdown[0]?.[0] ?? null;

          return (
            <div
              key={unit.id}
              className={`flex flex-col gap-6 ${
                index > 0
                  ? 'border-t border-slate-100 pt-8 dark:border-slate-900'
                  : ''
              }`}
            >
              {/* Unit Header */}
              <div className="flex flex-col">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Unit {unit.unit_no}
                </h2>
              </div>

              {/* Amount Due Card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#11314f] via-[#0a1f33] to-[#05101a] p-6 text-white shadow-xl">
                {/* Decorative glow */}
                <div className="pointer-events-none absolute top-[-15%] right-[-8%] h-56 w-56 rounded-full bg-gradient-to-br from-[#1b4b76] to-transparent opacity-40 blur-xl" />
                <div className="pointer-events-none absolute top-[-8%] right-[-4%] h-40 w-40 rounded-full bg-gradient-to-br from-[#246197] to-transparent opacity-30 blur-lg" />

                <div className="relative z-10 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold tracking-wider text-white/40 uppercase">
                      Total amount due
                    </span>
                    <div className="mt-1 text-5xl font-black tracking-tight text-[#F59E0B]">
                      {formatINR(totalOutstanding)}
                    </div>
                    <div className="mt-2 text-xs text-white/50">
                      {unpaidBills.length === 0
                        ? 'All paid'
                        : `${unpaidBills.length} bill${unpaidBills.length !== 1 ? 's' : ''} across ${periodBreakdown.length} month${periodBreakdown.length !== 1 ? 's' : ''}`}
                    </div>
                  </div>

                  {unpaidBills.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold shadow-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          overallStatus === 'Paid'
                            ? 'bg-green-600'
                            : overallStatus === 'Overdue'
                              ? 'bg-red-600'
                              : 'bg-amber-500'
                        }`}
                      />
                      <span
                        className={
                          overallStatus === 'Paid'
                            ? 'text-green-700'
                            : overallStatus === 'Overdue'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }
                      >
                        {overallStatus}
                      </span>
                    </div>
                  )}
                </div>

                {/* Per-period breakdown */}
                {periodBreakdown.length > 0 && (
                  <div className="relative z-10 mt-5 flex flex-col gap-2 border-t border-white/10 pt-5">
                    {periodBreakdown.map(([period, amt]) => {
                      const isLatest = period === latestPeriod;
                      const periodBills = unpaidBills.filter(
                        (b) => b.period === period,
                      );
                      const isOverdue = periodBills.some(
                        (b) => displayBillStatus(b) === 'Overdue',
                      );
                      return (
                        <div
                          key={period}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white/70">
                              {periodLabel(period)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isLatest && !isOverdue
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-red-500/20 text-red-300'
                              }`}
                            >
                              {isLatest && !isOverdue ? 'current' : 'overdue'}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-white">
                            {formatINR(amt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              {totalOutstanding > 0 && (
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/home/${account}/payments?unit=${unit.unit_no}`}
                    className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 active:bg-orange-800"
                  >
                    Pay all
                  </Link>
                  <Link
                    href={`/home/${account}/payments?unit=${unit.unit_no}`}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Pay by bill
                  </Link>
                </div>
              )}

              {/* Grid for History & Payments */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Bill History */}
                <Card className="border-slate-100 shadow-sm dark:border-slate-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold">
                      Bill history
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {unitBills.length === 0 ? (
                      <p className="text-muted-foreground py-4 text-center text-xs">
                        No bill history yet.
                      </p>
                    ) : (
                      unitBills.slice(0, 3).map((b) => {
                        const billStatus = displayBillStatus(b);
                        return (
                          <div
                            key={b.id}
                            className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0 dark:border-slate-900"
                          >
                            <div>
                              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {periodLabel(b.period)}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {b.bill_no}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge
                                className={billStatusBadgeClassName(billStatus)}
                              >
                                {billStatus} &middot;{' '}
                                {formatINR(b.total_amount)}
                              </Badge>
                              <DownloadPdfButton
                                href={`/api/billing/bills/${b.id}/pdf`}
                                label="Download bill PDF"
                                dataTest={`download-bill-${b.id}`}
                                variant="ghost"
                                iconSize="icon-xs"
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                {/* My Payments */}
                <Card className="border-slate-100 shadow-sm dark:border-slate-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold">
                      My payments
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {unitPayments.length === 0 ? (
                      <p className="text-muted-foreground py-4 text-center text-xs">
                        No payments recorded yet.
                      </p>
                    ) : (
                      unitPayments.slice(0, 3).map((p) => {
                        const receiptNo =
                          p.receipts?.receipt_no ||
                          `RCP-${p.id.slice(0, 4).toUpperCase()}`;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0 dark:border-slate-900"
                          >
                            <div>
                              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {receiptNo} &middot;{' '}
                                {periodLabel(p.bills?.period || '')}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {p.mode} &middot;{' '}
                                {new Date(p.paid_at).toLocaleDateString(
                                  'en-IN',
                                  {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  },
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {formatINR(p.amount)}
                              </span>
                              <DownloadPdfButton
                                href={`/api/billing/receipts/${p.id}/pdf`}
                                label="Download receipt PDF"
                                dataTest={`download-receipt-${p.id}`}
                                variant="ghost"
                                iconSize="icon-xs"
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const overview = await loadAssociationOverview(accountId, duration);
  const canManage = hasMinimumRole(role, 'billing_operator');

  if (!overview) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground text-sm">
            We couldn&apos;t load this association&apos;s details. Please
            refresh, and contact support if it keeps happening.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ageingMax = Math.max(
    overview.ageing.d0to7,
    overview.ageing.d8to30,
    overview.ageing.d30plus,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-2 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {`${overview.periodDisplay} · ${overview.totalUnits} units · ${overview.occupiedUnits} occupied`}
        </p>
        <DashboardDurationSelect value={duration} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/home/${account}/billing?duration=${duration}`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-blue-300 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none dark:hover:ring-blue-700"
        >
          <MetricCard
            icon={Receipt}
            variant="blue"
            label="Billed"
            value={formatINR(overview.billed)}
            sublabel={`${overview.billsGenerated} bills generated`}
            className="h-full"
          />
        </Link>
        <Link
          href={`/home/${account}/payments?duration=${duration}&status=collected`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-green-300 focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:outline-none dark:hover:ring-green-700"
        >
          <MetricCard
            icon={Banknote}
            variant="green"
            label="Collected"
            value={formatINR(overview.collected)}
            sublabel={
              overview.billed > 0
                ? `${Math.round((overview.collected / overview.billed) * 100)}% collection rate`
                : 'No bills yet'
            }
            className="h-full"
          />
        </Link>
        <Link
          href={`/home/${account}/billing?duration=${duration}&status=unpaid`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-amber-300 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none dark:hover:ring-amber-700"
        >
          <MetricCard
            icon={Clock}
            variant="amber"
            label="Outstanding"
            value={formatINR(overview.outstanding)}
            sublabel="Pending collection"
            className="h-full"
          />
        </Link>
        <Link
          href={`/home/${account}/billing?duration=${duration}&status=overdue`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-red-300 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none dark:hover:ring-red-700"
        >
          <MetricCard
            icon={AlertTriangle}
            variant="red"
            label="Overdue"
            value={formatINR(overview.overdueAmount)}
            sublabel={`${overview.overdueCount} units`}
            className="h-full"
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm">Collection progress</CardTitle>
            <Badge className={badgeExtras.success}>
              {overview.periodDisplay}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total billed</span>
                <span className="font-semibold">
                  {formatINR(overview.billed)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Collected</span>
                <span className="font-semibold text-emerald-600">
                  {formatINR(overview.collected)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-semibold text-amber-600">
                  {formatINR(overview.outstanding)}
                </span>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600"
                style={{
                  width:
                    overview.billed > 0
                      ? `${Math.min(100, (overview.collected / overview.billed) * 100)}%`
                      : '0%',
                }}
              />
            </div>
            <p className="mt-1.5 text-right text-xs font-semibold text-amber-600">
              {overview.billed > 0
                ? `${Math.round((overview.collected / overview.billed) * 100)}% collected`
                : 'No bills yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ageing analysis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <AgeingBar
              label="0–7 days"
              amount={overview.ageing.d0to7}
              maxAmount={ageingMax}
              colorClassName="bg-blue-500"
              textClassName="text-blue-600"
            />
            <AgeingBar
              label="8–30 days"
              amount={overview.ageing.d8to30}
              maxAmount={ageingMax}
              colorClassName="bg-amber-500"
              textClassName="text-amber-600"
            />
            <AgeingBar
              label=">30 days overdue"
              amount={overview.ageing.d30plus}
              maxAmount={ageingMax}
              colorClassName="bg-red-500"
              textClassName="text-red-600"
            />
          </CardContent>
        </Card>
      </div>

      {overview.overdueCount > 0 || !overview.mescomBillUploaded ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {overview.overdueCount > 0 ? (
              <Alert className={alertExtras.warning}>
                <AlertTriangle />
                <AlertDescription>
                  <strong>{overview.overdueCount} units</strong> overdue —{' '}
                  <Link
                    href={`/home/${account}/notifications`}
                    className="font-semibold underline"
                  >
                    send bulk reminder →
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}

            {!overview.mescomBillUploaded ? (
              <Alert className={alertExtras.info}>
                <Zap />
                <AlertDescription>
                  Electricity bill for {periodLabel(overview.currentMonth)}{' '}
                  hasn&apos;t been added yet.{' '}
                  <Link
                    href={`/home/${account}/electricity`}
                    className="font-semibold underline"
                  >
                    Add Bill →
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm">Recent activity</CardTitle>
          <Link
            href={`/home/${account}/audit`}
            className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline"
          >
            View all &rarr;
          </Link>
        </CardHeader>
        <CardContent>
          {overview.recentActivity.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nothing has happened here yet.
            </p>
          ) : (
            <div className="flex flex-col">
              {overview.recentActivity.map((entry, i) => {
                const isGreen =
                  entry.action.includes('payment') ||
                  entry.action.includes('unit.created');
                const isBlue = entry.action.includes('bill');
                const badgeBg = isGreen
                  ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                  : isBlue
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400';
                const dotBg = isGreen
                  ? 'bg-green-500'
                  : isBlue
                    ? 'bg-blue-500'
                    : 'bg-slate-400';

                return (
                  <div
                    key={i}
                    className="border-border flex min-w-0 flex-col gap-2 border-b py-4 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm font-medium break-words">
                      {entry.summary ?? entry.action}
                    </span>
                    <div
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${badgeBg}`}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full ${dotBg}`} />
                      {new Date(entry.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && overview.totalUnits === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="text-muted-foreground h-10 w-10" />
            <p className="text-muted-foreground max-w-sm text-sm">
              No units yet. Once you add your shops and offices, their billing
              and occupancy will show up here.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
