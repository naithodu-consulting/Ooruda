'use client';

import { useMemo } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AlertCircle, ArrowRight } from 'lucide-react';

import { billTypeLabel } from '@kit/pdf-templates';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { DownloadPdfButton } from '~/components/download-pdf-button';
import { displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';

import type { PaymentRow } from './bill-payments-dialog';
import type { CashLedgerDueRow } from './cash-ledger-dues-section';
import type { BillPaymentRow } from './payments-section';
import { RazorpayCheckoutButton } from './razorpay-checkout';
import { RazorpayDueCheckoutButton } from './razorpay-due-checkout';

type OutstandingBill = {
  kind: 'bill';
  id: string;
  billNo: string;
  billType: string;
  period: string;
  unitNo: string;
  outstanding: number;
  dueDate: string | null;
  isOverdue: boolean;
  daysOverdue: number;
};

type OutstandingDue = {
  kind: 'due';
  unitId: string;
  unitNo: string;
  billType: string;
  outstanding: number;
};

type OutstandingItem = OutstandingBill | OutstandingDue;

type FlatPayment = PaymentRow & {
  billNo: string;
  billType: string;
  period: string;
  unitNo: string;
  source: 'bill';
};

type DuePaymentHistoryRow = {
  id: string;
  unit_id: string;
  unit_no?: string;
  bill_type: string;
  amount: number;
  mode: string;
  paid_at: string;
  receipt_no: string | null;
};

export type AdvanceHistoryRow = {
  id: string;
  unit_id: string;
  unit_no?: string;
  bill_type: string;
  amount: number;
  entry_date: string;
  razorpay_payment_id: string | null;
};

type PayableBill = { id: string; billNo: string; outstanding: number };

interface Props {
  associationId: string;
  bills: BillPaymentRow[];
  dues: CashLedgerDueRow[];
  duePaymentHistory?: DuePaymentHistoryRow[];
  advanceHistory?: AdvanceHistoryRow[];
  units?: { id: string; unit_no: string }[];
  canPay: boolean;
  paidByRole: 'Owner' | 'Tenant';
  account: string;
  showUnitColumn: boolean;
}

function periodLabel(period: string): string {
  const d = new Date(period + '-01');
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function urgencyOrder(item: OutstandingItem): number {
  if (item.kind === 'bill' && item.isOverdue) return 0;
  if (item.kind === 'bill' && item.dueDate) return 1;
  if (item.kind === 'bill') return 2;
  return 3;
}

export function OwnerPaymentsView({
  associationId,
  bills,
  dues,
  duePaymentHistory = [],
  advanceHistory = [],
  units: _units = [],
  canPay,
  paidByRole,
  account,
  showUnitColumn,
}: Props) {
  const router = useRouter();

  const {
    outstanding,
    payableBills,
    totalOwed,
    billsTotal,
    cashTotal,
    hasOverdue,
    overdueCount,
    mostOverdueDays,
    recentPayments,
    hasCashDues,
  } = useMemo(() => {
    const items: OutstandingItem[] = [];

    for (const b of bills) {
      const owed = b.total_amount - b.paid_amount - (b.advance_applied ?? 0);
      if (owed <= 0.009) continue;
      const status = displayBillStatus(b);
      const isOverdue = status === 'Overdue';
      const daysOverdue =
        isOverdue && b.due_date
          ? Math.floor(
              (Date.now() - new Date(b.due_date).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : 0;
      items.push({
        kind: 'bill',
        id: b.id,
        billNo: b.bill_no,
        billType: b.bill_type,
        period: b.period,
        unitNo: b.unit_no,
        outstanding: Math.round(owed * 100) / 100,
        dueDate: b.due_date ?? null,
        isOverdue,
        daysOverdue,
      });
    }

    for (const d of dues) {
      items.push({
        kind: 'due',
        unitId: d.unit_id,
        unitNo: d.unit_no,
        billType: d.bill_type,
        outstanding: Math.abs(d.balance),
      });
    }

    items.sort((a, b) => {
      const ao = urgencyOrder(a);
      const bo = urgencyOrder(b);
      if (ao !== bo) return ao - bo;
      if (a.kind === 'bill' && b.kind === 'bill') {
        if (a.isOverdue && b.isOverdue) return b.daysOverdue - a.daysOverdue;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      }
      return b.outstanding - a.outstanding;
    });

    const totalOwed = items.reduce((s, i) => s + i.outstanding, 0);
    const overdueBills = items.filter(
      (i): i is OutstandingBill => i.kind === 'bill' && i.isOverdue,
    );
    const hasOverdue = overdueBills.length > 0;
    const overdueCount = overdueBills.length;
    const mostOverdueDays = overdueBills.reduce(
      (max, i) => Math.max(max, i.daysOverdue),
      0,
    );
    const hasCashDues = items.some((i) => i.kind === 'due');

    const payableBills: PayableBill[] = items
      .filter((i): i is OutstandingBill => i.kind === 'bill')
      .map((b) => ({ id: b.id, billNo: b.billNo, outstanding: b.outstanding }));

    // Merge bill payments and cash ledger due payments, newest first, limit 5
    const flat: (
      | FlatPayment
      | (DuePaymentHistoryRow & { source: 'due' })
      | (AdvanceHistoryRow & { source: 'advance' })
    )[] = [];

    for (const b of bills) {
      for (const p of b.payments) {
        flat.push({
          ...p,
          billNo: b.bill_no,
          billType: b.bill_type,
          period: b.period,
          unitNo: b.unit_no,
          source: 'bill' as const,
        });
      }
    }

    for (const dp of duePaymentHistory) {
      flat.push({ ...dp, source: 'due' as const });
    }

    for (const a of advanceHistory) {
      flat.push({ ...a, source: 'advance' as const });
    }

    flat.sort((a, b) => {
      const aDate =
        'paid_at' in a ? a.paid_at : 'entry_date' in a ? a.entry_date : '';
      const bDate =
        'paid_at' in b ? b.paid_at : 'entry_date' in b ? b.entry_date : '';
      return bDate.localeCompare(aDate);
    });

    const recentPayments = flat.slice(0, 5);

    const billsTotal = payableBills.reduce((s, b) => s + b.outstanding, 0);
    const cashTotal = totalOwed - billsTotal;

    return {
      outstanding: items,
      payableBills,
      totalOwed,
      billsTotal,
      cashTotal,
      hasOverdue,
      overdueCount,
      mostOverdueDays,
      recentPayments,
      hasCashDues,
    };
  }, [bills, dues, duePaymentHistory, advanceHistory]);

  const heroBg = hasOverdue
    ? 'bg-red-50/60 dark:bg-red-950/30'
    : totalOwed > 0
      ? 'bg-warning/5'
      : 'bg-success/5';

  const heroLeftBorder = hasOverdue
    ? 'border-l-red-500 dark:border-l-red-400'
    : totalOwed > 0
      ? 'border-l-warning'
      : 'border-l-success';

  const heroIconBg = hasOverdue
    ? 'bg-red-100 dark:bg-red-950/60'
    : totalOwed > 0
      ? 'bg-warning/10'
      : 'bg-success/10';

  const heroIconColor = hasOverdue
    ? 'text-destructive'
    : totalOwed > 0
      ? 'text-warning'
      : 'text-success';

  const heroAmtColor = hasOverdue
    ? 'text-destructive'
    : totalOwed > 0
      ? 'text-warning'
      : 'text-success';

  const heroSubLabel =
    totalOwed === 0
      ? "Nothing due. You're all paid up."
      : hasOverdue
        ? `${overdueCount} overdue · ${mostOverdueDays} day${mostOverdueDays !== 1 ? 's' : ''} late`
        : `${outstanding.length} item${outstanding.length !== 1 ? 's' : ''} pending`;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero - total outstanding */}
      <Card className={`border-l-4 ${heroLeftBorder} ${heroBg}`}>
        <CardContent className="px-5 py-4">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${heroIconBg}`}
            >
              <AlertCircle className={`h-6 w-6 ${heroIconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Total outstanding
              </p>
              <p
                className={`mt-0.5 text-3xl font-bold tracking-tight tabular-nums ${heroAmtColor}`}
              >
                {totalOwed === 0 ? 'All clear' : formatINR(totalOwed)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {heroSubLabel}
              </p>
              {totalOwed > 0 && hasCashDues && payableBills.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-background/70 border-border rounded-lg border p-2.5">
                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Bills
                    </p>
                    <p
                      className={`mt-0.5 text-base font-bold tabular-nums ${heroAmtColor}`}
                    >
                      {formatINR(billsTotal)}
                    </p>
                    {canPay && (
                      <div className="mt-2">
                        <RazorpayCheckoutButton
                          associationId={associationId}
                          bills={payableBills}
                          paidByRole={paidByRole}
                          label={`Pay · ${formatINR(billsTotal)}`}
                          size="sm"
                          onSuccess={() => router.refresh()}
                        />
                      </div>
                    )}
                  </div>
                  <div className="bg-background/70 border-border rounded-lg border p-2.5">
                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Dues
                    </p>
                    <p className="text-foreground mt-0.5 text-base font-bold tabular-nums">
                      {formatINR(cashTotal)}
                    </p>
                    {(() => {
                      const cashDues = outstanding.filter(
                        (i): i is OutstandingDue => i.kind === 'due',
                      );
                      if (canPay && cashDues.length === 1 && cashDues[0]) {
                        const due = cashDues[0];
                        return (
                          <div className="mt-2">
                            <RazorpayDueCheckoutButton
                              associationId={associationId}
                              unitId={due.unitId}
                              unitNo={due.unitNo}
                              billType={due.billType}
                              outstanding={due.outstanding}
                              onSuccess={() => router.refresh()}
                            />
                          </div>
                        );
                      }
                      return (
                        <p className="text-muted-foreground mt-2 text-xs">
                          Pay below ↓
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
              {totalOwed > 0 &&
                !hasCashDues &&
                canPay &&
                payableBills.length > 0 && (
                  <div className="mt-3">
                    <RazorpayCheckoutButton
                      associationId={associationId}
                      bills={payableBills}
                      paidByRole={paidByRole}
                      label={`Pay all bills · ${formatINR(billsTotal)}`}
                      size="sm"
                      onSuccess={() => router.refresh()}
                    />
                  </div>
                )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unified "What you owe" */}
      {outstanding.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Your Dues</CardTitle>
              <span className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
                {outstanding.length}
              </span>
            </div>
            <CardDescription>
              All outstanding charges, sorted by urgency.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-3 p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {showUnitColumn && (
                      <TableHead className="w-16 pl-4">Unit</TableHead>
                    )}
                    <TableHead className={showUnitColumn ? '' : 'pl-4'}>
                      Charge
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Due date
                    </TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {canPay && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding.map((item) => {
                    const key =
                      item.kind === 'bill'
                        ? item.id
                        : `${item.unitId}-${item.billType}`;
                    return (
                      <TableRow key={key}>
                        {showUnitColumn && (
                          <TableCell className="py-3 pl-4 text-sm font-medium">
                            {item.unitNo}
                          </TableCell>
                        )}
                        <TableCell
                          className={`py-3 ${showUnitColumn ? '' : 'pl-4'}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {item.kind === 'bill' && item.isOverdue && (
                              <span className="text-destructive inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-xs leading-none font-medium dark:bg-red-500/10">
                                Overdue
                              </span>
                            )}
                            {item.kind === 'bill' && !item.isOverdue && (
                              <span className="bg-warning/10 text-warning inline-flex items-center rounded px-1.5 py-0.5 text-xs leading-none font-medium">
                                Due
                              </span>
                            )}
                            {item.kind === 'due' && (
                              <span className="text-info inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs leading-none font-medium dark:bg-blue-500/10">
                                Due
                              </span>
                            )}
                            <span className="text-sm font-medium">
                              {billTypeLabel(item.billType)}
                              {item.kind === 'bill' && (
                                <span className="text-muted-foreground font-normal">
                                  {' '}
                                  · {periodLabel(item.period)}
                                </span>
                              )}
                            </span>
                          </div>
                          {item.kind === 'bill' && item.billNo && (
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {item.billNo}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden py-3 text-sm sm:table-cell">
                          {item.kind === 'bill' && item.dueDate ? (
                            <span
                              className={
                                item.isOverdue
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              }
                            >
                              {new Date(item.dueDate).toLocaleDateString(
                                'en-IN',
                                {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                },
                              )}
                              {item.isOverdue && ` · ${item.daysOverdue}d late`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-destructive py-3 pr-4 text-right text-sm font-bold tabular-nums">
                          {formatINR(item.outstanding)}
                        </TableCell>
                        {canPay && (
                          <TableCell className="py-3 pr-4 text-right">
                            {item.kind === 'bill' ? (
                              <RazorpayCheckoutButton
                                associationId={associationId}
                                bills={[
                                  {
                                    id: item.id,
                                    billNo: item.billNo,
                                    outstanding: item.outstanding,
                                  },
                                ]}
                                paidByRole={paidByRole}
                                label={`Pay ${formatINR(item.outstanding)}`}
                                size="sm"
                                onSuccess={() => router.refresh()}
                              />
                            ) : (
                              <RazorpayDueCheckoutButton
                                associationId={associationId}
                                unitId={item.unitId}
                                unitNo={item.unitNo}
                                billType={item.billType}
                                outstanding={item.outstanding}
                                onSuccess={() => router.refresh()}
                              />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent payments */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent payments</CardTitle>
              <CardDescription>Your latest payments.</CardDescription>
            </div>
            <Link
              href={`/home/${account}/statement`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
            >
              Full statement
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentPayments.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {showUnitColumn && (
                      <TableHead className="w-16 pl-4">Unit</TableHead>
                    )}
                    <TableHead className={showUnitColumn ? '' : 'pl-4'}>
                      Payment
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.map((p) => {
                    if (p.source === 'bill') {
                      const fp = p as FlatPayment;
                      return (
                        <TableRow key={`bill-${fp.id}`}>
                          {showUnitColumn && (
                            <TableCell className="py-3 pl-4 text-sm font-medium">
                              {fp.unitNo}
                            </TableCell>
                          )}
                          <TableCell
                            className={`py-3 ${showUnitColumn ? '' : 'pl-4'}`}
                          >
                            <p className="text-sm font-medium">
                              {billTypeLabel(fp.billType)}{' '}
                              <span className="text-muted-foreground font-normal">
                                · {periodLabel(fp.period)}
                              </span>
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {fp.billNo}
                              {fp.mode ? ` · via ${fp.mode}` : ''}
                              {fp.receipt_no ? ` · ${fp.receipt_no}` : ''}
                            </p>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden py-3 text-sm sm:table-cell">
                            {new Date(fp.paid_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-success py-3 pr-2 text-right text-sm font-semibold tabular-nums">
                            {formatINR(fp.amount)}
                          </TableCell>
                          <TableCell className="py-3 pr-3">
                            <DownloadPdfButton
                              href={`/api/billing/receipts/${fp.id}/pdf`}
                              label="Download receipt PDF"
                              dataTest={`download-receipt-${fp.id}`}
                              variant="ghost"
                              iconSize="icon-xs"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    if (p.source === 'advance') {
                      const adv = p as AdvanceHistoryRow & {
                        source: 'advance';
                      };
                      return (
                        <TableRow key={`adv-${adv.id}`}>
                          {showUnitColumn && (
                            <TableCell className="py-3 pl-4 text-sm font-medium">
                              {adv.unit_no ?? ''}
                            </TableCell>
                          )}
                          <TableCell
                            className={`py-3 ${showUnitColumn ? '' : 'pl-4'}`}
                          >
                            <p className="text-sm font-medium">
                              {billTypeLabel(adv.bill_type)}{' '}
                              <span className="text-muted-foreground font-normal">
                                · Advance Deposit
                              </span>
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {adv.razorpay_payment_id
                                ? `via Razorpay · ${adv.razorpay_payment_id}`
                                : 'Cash / Manual'}
                            </p>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden py-3 text-sm sm:table-cell">
                            {new Date(
                              adv.entry_date + 'T00:00:00',
                            ).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-success py-3 pr-2 text-right text-sm font-semibold tabular-nums">
                            {formatINR(adv.amount)}
                          </TableCell>
                          <TableCell className="py-3 pr-3">
                            <DownloadPdfButton
                              href={`/api/billing/advance-payments/${adv.id}/pdf`}
                              label="Download receipt PDF"
                              dataTest={`download-advance-receipt-${adv.id}`}
                              variant="ghost"
                              iconSize="icon-xs"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    // Cash ledger due payment
                    const dp = p as DuePaymentHistoryRow & { source: 'due' };
                    const receiptNo = dp.receipt_no ?? null;
                    return (
                      <TableRow key={`due-${dp.id}`}>
                        {showUnitColumn && (
                          <TableCell className="py-3 pl-4 text-sm font-medium">
                            {dp.unit_no ?? ''}
                          </TableCell>
                        )}
                        <TableCell
                          className={`py-3 ${showUnitColumn ? '' : 'pl-4'}`}
                        >
                          <p className="text-sm font-medium">
                            {billTypeLabel(dp.bill_type)}{' '}
                            <span className="text-muted-foreground font-normal">
                              · Due
                            </span>
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {dp.mode ? `via ${dp.mode}` : ''}
                            {receiptNo ? ` · ${receiptNo}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden py-3 text-sm sm:table-cell">
                          {new Date(dp.paid_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-success py-3 pr-2 text-right text-sm font-semibold tabular-nums">
                          {formatINR(dp.amount)}
                        </TableCell>
                        <TableCell className="py-3 pr-3">
                          <DownloadPdfButton
                            href={`/api/billing/cash-ledger-payments/${dp.id}/pdf`}
                            label="Download receipt PDF"
                            dataTest={`download-due-receipt-${dp.id}`}
                            variant="ghost"
                            iconSize="icon-xs"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
