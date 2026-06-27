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

import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import {
  daysBetweenYmd,
  formatYmdLong,
  todayInBillingZone,
} from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';
import { type PropOpsRole, hasMinimumRole } from '~/lib/rbac';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const periodLabel = formatPeriod;

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

async function loadAssociationOverview(accountId: string) {
  const client = getSupabaseServerClient();
  const period = currentPeriod();

  const { data: association } = await client
    .from('associations')
    .select('id, status')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    return null;
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
      .eq('status', 'Occupied'),
    client
      .from('bills')
      .select('total_amount, paid_amount, status, due_date')
      .eq('association_id', association.id)
      .eq('period', period),
    client
      .from('mescom_bills')
      .select('id')
      .eq('association_id', association.id)
      .eq('period', period)
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
    period,
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

async function loadMyBillSummary(accountId: string, userId: string) {
  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!association) {
    return null;
  }

  // Fetch ALL units owned by this user in this association.
  const { data: ownedUnits } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', association.id)
    .eq('owner_id', userId)
    .order('unit_no');

  let units: { id: string; unit_no: string }[] = ownedUnits ?? [];

  // Fallback: tenant with no owned units — find all active tenancy units in this association.
  if (units.length === 0) {
    const { data: tenancies } = await client
      .from('tenancies')
      .select('units!inner(id, unit_no, association_id)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .eq('units.association_id', association.id);

    units = (tenancies ?? [])
      .map((t) => t.units as { id: string; unit_no: string } | null)
      .filter((u): u is { id: string; unit_no: string } => u !== null);
  }

  if (units.length === 0) {
    return null;
  }

  // Fetch ALL bills for ALL owned units, newest period first.
  const unitIds = units.map((u) => u.id);
  const { data: allBills } = await client
    .from('bills')
    .select(
      'id, bill_no, period, total_amount, paid_amount, status, due_date, unit_id',
    )
    .in('unit_id', unitIds)
    .order('period', { ascending: false });

  const bills = allBills ?? [];
  const totalOutstanding = bills.reduce(
    (sum, b) => sum + Math.max(0, b.total_amount - b.paid_amount),
    0,
  );
  const totalBilled = bills.reduce((sum, b) => sum + b.total_amount, 0);

  // Most recent bill per unit for the per-unit breakdown.
  const latestBillByUnit = new Map<string, (typeof bills)[number]>();
  for (const bill of bills) {
    if (!latestBillByUnit.has(bill.unit_id)) {
      latestBillByUnit.set(bill.unit_id, bill);
    }
  }

  return {
    units,
    bills,
    totalBilled,
    totalOutstanding,
    latestBillByUnit,
  };
}

export async function AssociationDashboard({
  account,
  accountId,
  userId,
  role,
}: {
  account: string;
  accountId: string;
  userId: string;
  role: PropOpsRole;
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

    const { units, totalOutstanding, totalBilled, latestBillByUnit } = summary;
    const unitLabel = units.map((u) => u.unit_no).join(', ');
    const hasBills = latestBillByUnit.size > 0;

    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {units.length === 1 ? `Unit ${unitLabel}` : `Units: ${unitLabel}`}
        </p>

        {hasBills ? (
          <div className="rounded-2xl bg-gradient-to-br from-[#0C1829] via-[#1A3A58] to-[#0F2440] p-4 text-white sm:p-6">
            {/* Total outstanding across all units */}
            <div className="flex min-w-0 items-start justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider text-white/45 uppercase">
                  Amount due
                </div>
                <div className="text-primary mt-1.5 text-2xl font-black tracking-tight break-words sm:text-3xl">
                  {formatINR(totalOutstanding)}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  {formatINR(totalBilled)} billed across {units.length}{' '}
                  {units.length === 1 ? 'unit' : 'units'}
                </div>
              </div>
            </div>

            {/* Per-unit breakdown */}
            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
              {units.map((unit) => {
                const bill = latestBillByUnit.get(unit.id);
                if (!bill) return null;
                const outstanding = bill.total_amount - bill.paid_amount;
                const status = displayBillStatus(bill);

                return (
                  <div
                    key={unit.id}
                    className="flex min-w-0 flex-col gap-2 rounded-lg border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:p-0"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold sm:inline">
                        Unit {unit.unit_no}
                      </span>
                      <span className="mt-1 block text-xs break-words text-white/50 sm:mt-0 sm:ml-2 sm:inline">
                        Bill {bill.bill_no} &middot; {periodLabel(bill.period)}
                        &middot; Due {formatYmdLong(bill.due_date)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatINR(outstanding)}
                      </span>
                      <Badge
                        variant="outline"
                        className={billStatusBadgeClassName(status)}
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground text-sm">
                You don&apos;t have any bills yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const overview = await loadAssociationOverview(accountId);
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
      <p className="text-muted-foreground -mt-2 text-sm">
        {`${periodLabel(overview.period)} · ${overview.totalUnits} units · ${overview.occupiedUnits} occupied`}
      </p>

      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Receipt}
          variant="blue"
          label="Billed"
          value={formatINR(overview.billed)}
          sublabel={`${overview.billsGenerated} bills generated`}
        />
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
        />
        <MetricCard
          icon={Clock}
          variant="amber"
          label="Outstanding"
          value={formatINR(overview.outstanding)}
          sublabel="Pending collection"
        />
        <MetricCard
          icon={AlertTriangle}
          variant="red"
          label="Overdue"
          value={formatINR(overview.overdueAmount)}
          sublabel={`${overview.overdueCount} units`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm">Collection progress</CardTitle>
            <Badge className={badgeExtras.success}>
              {periodLabel(overview.period)}
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
                  Electricity bill for {periodLabel(overview.period)} hasn&apos;t
                  been added yet.{' '}
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
