'use client';

import { useState } from 'react';

import Link from 'next/link';

import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

import { DownloadPdfButton } from '~/components/download-pdf-button';
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { billTypeLabel } from '~/lib/bill-type-labels';
import type { UnitCashLedgerBalance } from '~/lib/cash-ledger-aggregation';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

// ── Serializable data shapes ────────────────────────────────────────────────

export interface SerializableBill {
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

export interface SerializablePayment {
  id: string;
  amount: number;
  mode: string;
  paid_at: string;
  bill_id: string;
  bills: { period: string; bill_no: string } | null;
  receipts: { receipt_no: string } | null;
}

export interface SerializableDuePayment {
  id: string;
  unit_id: string;
  bill_type: string;
  amount: number;
  mode: string;
  paid_at: string;
}

interface Props {
  account: string;
  role: 'prop_owner' | 'tenant';
  assocName: string;
  units: { id: string; unit_no: string }[];
  bills: SerializableBill[];
  payments: SerializablePayment[];
  duePayments: SerializableDuePayment[];
  ledgerBalances: UnitCashLedgerBalance[];
}

const PREVIEW_COUNT = 4;

function statusOrder(b: SerializableBill): number {
  const s = displayBillStatus(b);
  if (s === 'Overdue') return 0;
  if (s === 'Unpaid' || s === 'Partial') return 1;
  return 2;
}

export function OwnerUnitsView({
  account,
  role,
  assocName,
  units,
  bills,
  payments,
  duePayments,
  ledgerBalances,
}: Props) {
  const ALL = '__all__';
  const [activeUnitId, setActiveUnitId] = useState<string>(ALL);

  return (
    <div className="flex flex-col gap-8">
      {/* Page header + unit pill filter */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {role === 'prop_owner' ? 'Owner Dashboard' : 'Tenant Dashboard'}
          </h1>
          <p className="text-muted-foreground text-sm">{assocName}</p>
        </div>

        {units.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveUnitId(ALL)}
              className={`rounded-full border px-3.5 py-1 text-sm font-medium transition-colors ${
                activeUnitId === ALL
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              All units
            </button>
            {units.map((u) => (
              <button
                key={u.id}
                onClick={() => setActiveUnitId(u.id)}
                className={`rounded-full border px-3.5 py-1 text-sm font-medium transition-colors ${
                  activeUnitId === u.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Unit {u.unit_no}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active unit section */}
      {(activeUnitId === ALL
        ? units
        : units.filter((u) => u.id === activeUnitId)
      ).map((unit, index) => {
        const unitBills = bills.filter((b) => b.unit_id === unit.id);
        const unitPayments = payments.filter((p) =>
          unitBills.some((b) => b.id === p.bill_id),
        );
        const unitDuePayments = duePayments.filter(
          (dp) => dp.unit_id === unit.id,
        );
        const totalPaymentCount = unitPayments.length + unitDuePayments.length;

        const sortedBills = [...unitBills].sort(
          (a, b) =>
            statusOrder(a) - statusOrder(b) || b.period.localeCompare(a.period),
        );
        const previewBills = sortedBills.slice(0, PREVIEW_COUNT);
        const previewPayments = unitPayments.slice(0, PREVIEW_COUNT);

        const unpaidBills = unitBills.filter(
          (b) =>
            b.status === 'Unpaid' ||
            b.status === 'Partial' ||
            b.status === 'Overdue',
        );

        const totalOutstanding = unpaidBills.reduce(
          (sum, b) => sum + Math.max(0, b.total_amount - b.paid_amount),
          0,
        );

        const hasOverdue = unpaidBills.some(
          (b) => displayBillStatus(b) === 'Overdue',
        );
        const overallStatus = hasOverdue
          ? 'Overdue'
          : unpaidBills.length > 0
            ? 'Unpaid'
            : 'Paid';

        const unpaidByPeriod = new Map<string, number>();
        for (const b of unpaidBills) {
          const amt = Math.max(0, b.total_amount - b.paid_amount);
          unpaidByPeriod.set(
            b.period,
            (unpaidByPeriod.get(b.period) ?? 0) + amt,
          );
        }
        const periodBreakdown = Array.from(unpaidByPeriod.entries()).sort(
          ([a], [b]) => b.localeCompare(a),
        );
        const latestPeriod = periodBreakdown[0]?.[0] ?? null;

        const bal = ledgerBalances.find((b) => b.unit_id === unit.id);

        return (
          <div
            key={unit.id}
            className={`flex flex-col gap-6 ${index > 0 ? 'border-t border-slate-100 pt-8 dark:border-slate-900' : ''}`}
          >
            {/* Unit label — only shown when viewing all units */}
            {activeUnitId === ALL && (
              <h2 className="text-foreground text-lg font-bold tracking-tight">
                Unit {unit.unit_no}
              </h2>
            )}

            {/* Amount Due Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#11314f] via-[#0a1f33] to-[#05101a] p-6 text-white shadow-xl">
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
                            {formatPeriod(period)}
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
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition-colors"
                >
                  Pay all
                </Link>
                <Link
                  href={`/home/${account}/payments?unit=${unit.unit_no}`}
                  className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-bold transition-colors"
                >
                  Pay by bill
                </Link>
              </div>
            )}

            {/* Ledger balance */}
            {bal && (bal.totalDue > 0 || bal.totalCredit > 0) && (
              <div className="border-border overflow-hidden rounded-xl border">
                {bal.totalDue > 0 && (
                  <div className="bg-destructive/5 border-border border-l-destructive border-b border-l-4 p-4 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-destructive/70 text-xs font-semibold tracking-wide uppercase">
                          Pending dues
                        </p>
                        <p className="text-destructive mt-1 text-2xl font-bold tabular-nums">
                          {formatINR(bal.totalDue)}
                        </p>
                        <p className="text-destructive/50 mt-0.5 text-xs">
                          Separate from your monthly bills
                        </p>
                      </div>
                      <Link
                        href={`/home/${account}/payments`}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                      >
                        Pay now
                      </Link>
                    </div>
                    {bal.dues.length > 1 && (
                      <div className="border-destructive/10 mt-3 flex flex-col gap-1.5 border-t pt-3">
                        {bal.dues.map((d) => (
                          <div
                            key={d.bill_type}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-destructive/60">
                              {billTypeLabel(d.bill_type)}
                            </span>
                            <span className="text-destructive font-medium tabular-nums">
                              {formatINR(d.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {bal.totalCredit > 0 && (
                  <div
                    className="bg-accent border-primary border-l-4 p-4"
                    style={{ color: 'var(--sidebar-foreground)' }}
                  >
                    <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                      Advance credit
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                      {formatINR(bal.totalCredit)}
                    </p>
                    <p className="mt-0.5 text-xs opacity-60">
                      Automatically applied to your bills of the same type
                    </p>
                    {bal.credits.length > 1 && (
                      <div className="border-primary/20 mt-3 flex flex-col gap-1.5 border-t pt-3">
                        {bal.credits.map((c) => (
                          <div
                            key={c.bill_type}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="opacity-70">
                              {billTypeLabel(c.bill_type)}
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatINR(c.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bill History + My Payments grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">
                      Bill history
                    </CardTitle>
                    {unitBills.length > PREVIEW_COUNT && (
                      <Link
                        href={`/home/${account}/payments`}
                        className="border-border text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                      >
                        View all
                      </Link>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {unitBills.length === 0 ? (
                    <p className="text-muted-foreground py-4 text-center text-xs">
                      No bill history yet.
                    </p>
                  ) : (
                    previewBills.map((b) => {
                      const billStatus = displayBillStatus(b);
                      return (
                        <div
                          key={b.id}
                          className="border-border/40 flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                        >
                          <div>
                            <span className="text-foreground block text-sm font-semibold">
                              {formatPeriod(b.period)}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              {b.bill_no}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              className={billStatusBadgeClassName(billStatus)}
                            >
                              {billStatus} &middot; {formatINR(b.total_amount)}
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

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">
                      My payments
                    </CardTitle>
                    {totalPaymentCount > PREVIEW_COUNT && (
                      <Link
                        href={`/home/${account}/payments`}
                        className="border-border text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                      >
                        View all
                      </Link>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {totalPaymentCount === 0 ? (
                    <p className="text-muted-foreground py-4 text-center text-xs">
                      No payments recorded yet.
                    </p>
                  ) : (
                    <>
                      {previewPayments.map((p) => {
                        const receiptNo =
                          p.receipts?.receipt_no ||
                          `RCP-${p.id.slice(0, 4).toUpperCase()}`;
                        return (
                          <div
                            key={p.id}
                            className="border-border/40 flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                          >
                            <div>
                              <span className="text-foreground block text-sm font-semibold">
                                {receiptNo} &middot;{' '}
                                {formatPeriod(p.bills?.period ?? '')}
                              </span>
                              <span className="text-muted-foreground block text-xs">
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
                              <span className="text-foreground text-sm font-bold tabular-nums">
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
                      })}
                      {unitDuePayments
                        .slice(
                          0,
                          Math.max(0, PREVIEW_COUNT - previewPayments.length),
                        )
                        .map((dp) => (
                          <div
                            key={dp.id}
                            className="border-border/40 flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                          >
                            <div>
                              <span className="text-foreground block text-sm font-semibold">
                                Due · {billTypeLabel(dp.bill_type)}
                              </span>
                              <span className="text-muted-foreground block text-xs">
                                {dp.mode} &middot;{' '}
                                {new Date(dp.paid_at).toLocaleDateString(
                                  'en-IN',
                                  {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  },
                                )}
                              </span>
                            </div>
                            <span className="text-foreground text-sm font-bold tabular-nums">
                              {formatINR(dp.amount)}
                            </span>
                          </div>
                        ))}
                    </>
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
