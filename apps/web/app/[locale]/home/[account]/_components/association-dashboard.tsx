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
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import {
  daysBetweenYmd,
  formatYmdLong,
  todayInBillingZone,
} from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';
import { getAccessibleUnits } from '~/lib/unit-access';
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

  // Most recent bill per unit for the per-unit breakdown.
  const latestBillByUnit = new Map<string, BillWithLineItems>();
  for (const bill of bills) {
    if (!latestBillByUnit.has(bill.unit_id)) {
      latestBillByUnit.set(bill.unit_id, bill);
    }
  }

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
    latestBillByUnit,
    payments,
    assocName,
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

    const { units, bills, latestBillByUnit, payments, assocName } = summary;

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
          const latestBill = latestBillByUnit.get(unit.id);
          const unitPayments = payments.filter(
            (p) =>
              p.bill_id === latestBill?.id ||
              unitBills.some((b: any) => b.id === p.bill_id),
          );

          const outstanding = latestBill
            ? Math.max(0, latestBill.total_amount - latestBill.paid_amount)
            : 0;
          const status = latestBill ? displayBillStatus(latestBill) : 'Paid';

          // Extract Maintenance and Electricity breakdown
          let maintenanceAmount = 0;
          let electricityAmount = 0;

          if (latestBill && latestBill.bill_line_items) {
            const items = latestBill.bill_line_items as any[];
            const maint = items.find((i) =>
              i.description.toLowerCase().includes('maintenance'),
            );
            const elec = items.find((i) =>
              i.description.toLowerCase().includes('electricity'),
            );
            if (maint) maintenanceAmount = maint.amount;
            if (elec) electricityAmount = elec.amount;
          }

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

              {/* Amount Due Card - Premium Prototype Style */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#11314f] via-[#0a1f33] to-[#05101a] p-6 text-white shadow-xl">
                {/* Shiny Decorative Circle / Glow */}
                <div className="pointer-events-none absolute top-[-15%] right-[-8%] h-56 w-56 rounded-full bg-gradient-to-br from-[#1b4b76] to-transparent opacity-40 blur-xl" />
                <div className="pointer-events-none absolute top-[-8%] right-[-4%] h-40 w-40 rounded-full bg-gradient-to-br from-[#246197] to-transparent opacity-30 blur-lg" />

                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-white/40 uppercase">
                      Amount Due
                    </span>
                    <div className="mt-1 text-5xl font-black tracking-tight text-[#F59E0B]">
                      {formatINR(outstanding)}
                    </div>
                    {latestBill && (
                      <div className="mt-2 text-xs text-white/50">
                        Bill {latestBill.bill_no} &middot;{' '}
                        {periodLabel(latestBill.period)}
                      </div>
                    )}
                  </div>

                  {latestBill && (
                    <div className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold shadow-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          status === 'Paid'
                            ? 'bg-green-600'
                            : status === 'Partial'
                              ? 'bg-amber-500'
                              : 'bg-red-600'
                        }`}
                      />
                      <span
                        className={
                          status === 'Paid'
                            ? 'text-green-700'
                            : status === 'Partial'
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }
                      >
                        {status}
                      </span>
                    </div>
                  )}
                </div>

                {latestBill && (
                  <div className="relative z-10 mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                    <div>
                      <span className="block text-[10px] font-bold tracking-wider text-white/40 uppercase">
                        Due Date
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-white">
                        {formatYmdLong(latestBill.due_date)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold tracking-wider text-white/40 uppercase">
                        Maintenance
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-white">
                        {formatINR(maintenanceAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold tracking-wider text-white/40 uppercase">
                        Electricity
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-white">
                        {formatINR(electricityAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              {latestBill && outstanding > 0 && (
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/home/${account}/payments?billId=${latestBill.id}`}
                    className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 active:bg-orange-800"
                  >
                    Pay now
                  </Link>
                  <a
                    href={`/api/billing/bills/${latestBill.id}/pdf`}
                    download
                    data-test="download-latest-bill"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Download bill
                  </a>
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
                  Electricity bill for {periodLabel(overview.period)}{' '}
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
