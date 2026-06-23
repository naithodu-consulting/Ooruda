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
import { type PropOpsRole, hasMinimumRole } from '~/lib/rbac';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
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

  const { data: ownedUnit } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', accountId)
    .eq('owner_id', userId)
    .maybeSingle();

  let unit = ownedUnit;

  if (!unit) {
    const { data: tenancy } = await client
      .from('tenancies')
      .select('unit_id, units(id, unit_no)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    unit = tenancy?.units
      ? { id: tenancy.units.id, unit_no: tenancy.units.unit_no }
      : null;
  }

  if (!unit) {
    return null;
  }

  const { data: latestBill } = await client
    .from('bills')
    .select('id, bill_no, period, total_amount, paid_amount, status, due_date')
    .eq('unit_id', unit.id)
    .order('period', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { unit, latestBill };
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

    const bill = summary.latestBill;

    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Unit {summary.unit.unit_no}
        </p>

        {bill ? (
          <div className="rounded-2xl bg-gradient-to-br from-[#0C1829] via-[#1A3A58] to-[#0F2440] p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold tracking-wider text-white/45 uppercase">
                  Amount due
                </div>
                <div className="text-primary mt-1.5 text-3xl font-black tracking-tight">
                  {formatINR(bill.total_amount - bill.paid_amount)}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Bill {bill.bill_no} &middot; {periodLabel(bill.period)}
                </div>
              </div>

              <Badge
                variant="outline"
                className={billStatusBadgeClassName(displayBillStatus(bill))}
              >
                {displayBillStatus(bill)}
              </Badge>
            </div>

            <div className="mt-4 flex gap-6 border-t border-white/10 pt-4">
              <div>
                <div className="text-[9px] font-bold tracking-wider text-white/40 uppercase">
                  Due date
                </div>
                <div className="mt-0.5 text-sm font-semibold">
                  {formatYmdLong(bill.due_date)}
                </div>
              </div>
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

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
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
          <CardHeader className="flex flex-row items-center justify-between">
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
                  MESCOM bill for {periodLabel(overview.period)} hasn&apos;t
                  been uploaded yet —{' '}
                  <Link
                    href={`/home/${account}/mescom`}
                    className="font-semibold underline"
                  >
                    upload bill →
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {overview.recentActivity.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nothing has happened here yet.
            </p>
          ) : (
            overview.recentActivity.map((entry, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b pb-3 text-sm last:border-0 last:pb-0"
              >
                <span className="font-medium">
                  {entry.summary ?? entry.action}
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(entry.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            ))
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
