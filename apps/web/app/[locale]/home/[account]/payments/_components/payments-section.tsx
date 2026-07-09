'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import {
  BILL_STATUS_ITEMS,
  BILL_TYPE_FILTER_ITEMS,
  getDurationItems,
} from '~/lib/bill-filter-items';
import { getPeriodsForDuration } from '~/lib/bill-period-filter';
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { BillPaymentsDialog, type PaymentRow } from './bill-payments-dialog';
import { RazorpayCheckoutButton } from './razorpay-checkout';
import { RecordPaymentDialog } from './record-payment-dialog';

export interface BillPaymentRow {
  id: string;
  period: string;
  bill_no: string;
  bill_type: string;
  unit_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  payments: PaymentRow[];
}

const PAGE_SIZE = 25;
const ALL_UNITS = '__all__';

export function PaymentsSection(props: {
  associationId: string;
  bills: BillPaymentRow[];
  canManage: boolean;
  canVoid: boolean;
  canPay?: boolean;
  paidByRole?: 'Owner' | 'Tenant';
  title?: string;
  description?: string;
  accountSlug?: string;
  initialDuration?: string;
  initialStatus?: string;
  initialUnit?: string;
}) {
  const router = useRouter();
  const onPaymentSuccess = useCallback(() => router.refresh(), [router]);

  const [statusVal, setStatusVal] = useState(props.initialStatus ?? 'all');
  const [typeVal, setTypeVal] = useState('all');
  const [durationVal, setDurationVal] = useState(
    props.initialDuration ?? 'all',
  );
  const [unitTab, setUnitTab] = useState(props.initialUnit ?? ALL_UNITS);
  const [page, setPage] = useState(1);

  // Distinct units from all bills — used to render unit tabs for owner/tenant view
  const unitList = useMemo(() => {
    const seen = new Set<string>();
    const units: string[] = [];
    for (const b of props.bills) {
      if (!seen.has(b.unit_no)) {
        seen.add(b.unit_no);
        units.push(b.unit_no);
      }
    }
    return units.sort();
  }, [props.bills]);

  const durationItems = useMemo(() => getDurationItems(), []);
  const today = useMemo(() => todayInBillingZone(), []);

  // Derived: filtered rows (instant — no network)
  const filtered = useMemo(() => {
    let rows = props.bills;

    if (unitTab !== ALL_UNITS) {
      rows = rows.filter((b) => b.unit_no === unitTab);
    }

    if (statusVal !== 'all') {
      if (statusVal === 'collected') {
        // Collected = any bill with money received (Paid or Partial)
        rows = rows.filter(
          (b) => b.status === 'Paid' || b.status === 'Partial',
        );
      } else if (statusVal === 'paid') {
        rows = rows.filter((b) => b.status === 'Paid');
      } else if (statusVal === 'unpaid') {
        rows = rows.filter((b) => b.status === 'Unpaid' && b.due_date >= today);
      } else if (statusVal === 'partial') {
        rows = rows.filter(
          (b) => b.status === 'Partial' && b.due_date >= today,
        );
      } else if (statusVal === 'overdue') {
        rows = rows.filter(
          (b) =>
            b.status === 'Overdue' ||
            ((b.status === 'Unpaid' || b.status === 'Partial') &&
              b.due_date < today),
        );
      }
    }

    if (typeVal !== 'all') {
      rows = rows.filter((b) => b.bill_type === typeVal);
    }

    if (durationVal !== 'all') {
      const periods = getPeriodsForDuration(durationVal);
      if (periods) {
        const set = new Set(periods);
        rows = rows.filter((b) => set.has(b.period));
      }
    }

    return rows;
  }, [props.bills, unitTab, statusVal, typeVal, durationVal, today]);

  // Derived: summary metrics
  const metrics = useMemo(() => {
    const totalBilled = filtered.reduce((s, b) => s + b.total_amount, 0);
    const totalCollected = filtered.reduce((s, b) => s + b.paid_amount, 0);
    const paymentCount = filtered.reduce((s, b) => s + b.payments.length, 0);
    return {
      totalBilled,
      totalCollected,
      totalOutstanding: totalBilled - totalCollected,
      paymentCount,
    };
  }, [filtered]);

  // Derived: paginated rows
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const setFilter = (setter: (v: string) => void) => (val: string | null) => {
    setter(val ?? 'all');
    setPage(1);
  };

  const handleUnitTab = (unit: string) => {
    setUnitTab(unit);
    setPage(1);
  };

  // Pending bills for "Pay All" — scoped to selected unit only (never cross-unit)
  const allPendingBills = useMemo(() => {
    if (unitTab === ALL_UNITS) return [];
    return props.bills
      .filter(
        (b) =>
          b.unit_no === unitTab &&
          (b.status === 'Unpaid' ||
            b.status === 'Partial' ||
            b.status === 'Overdue'),
      )
      .map((b) => ({
        id: b.id,
        billNo: b.bill_no,
        outstanding: b.total_amount - b.paid_amount,
      }))
      .filter((b) => b.outstanding > 0);
  }, [props.bills, unitTab]);

  const isEmpty =
    props.bills.length === 0 &&
    statusVal === 'all' &&
    typeVal === 'all' &&
    durationVal === 'all' &&
    unitTab === ALL_UNITS;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{props.title ?? 'Payments'}</CardTitle>
            <CardDescription>
              {props.description ??
                'Record payments against bills and track receipts.'}
            </CardDescription>
          </div>
          {props.canPay && props.paidByRole && allPendingBills.length > 1 && (
            <RazorpayCheckoutButton
              associationId={props.associationId}
              bills={allPendingBills}
              paidByRole={props.paidByRole}
              onSuccess={onPaymentSuccess}
            />
          )}
        </div>

        {/* Unit tab pills — only for owner/tenant with multiple units */}
        {props.canPay && unitList.length > 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => handleUnitTab(ALL_UNITS)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                unitTab === ALL_UNITS
                  ? 'bg-foreground text-background border-transparent'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground bg-transparent',
              )}
            >
              All Units
            </button>
            {unitList.map((u) => (
              <button
                key={u}
                onClick={() => handleUnitTab(u)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  unitTab === u
                    ? 'bg-foreground text-background border-transparent'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground bg-transparent',
                )}
              >
                Unit {u}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5">
        {/* Filters always visible */}
        <div className="flex flex-wrap items-center gap-4 border-b pb-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Payment Status
            </span>
            <Select
              items={BILL_STATUS_ITEMS}
              value={statusVal}
              onValueChange={setFilter(setStatusVal)}
            >
              <SelectTrigger className="bg-background h-9 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Bill Type
            </span>
            <Select
              items={BILL_TYPE_FILTER_ITEMS}
              value={typeVal}
              onValueChange={setFilter(setTypeVal)}
            >
              <SelectTrigger className="bg-background h-9 w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="electricity">Electricity</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="other_charges">Other Charges</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Duration
            </span>
            <Select
              items={durationItems}
              value={durationVal}
              onValueChange={setFilter(setDurationVal)}
            >
              <SelectTrigger className="bg-background h-9 w-[180px]">
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="current_month">Current Month</SelectItem>
                <SelectItem value="prev_month">Previous Month</SelectItem>
                <SelectItem value="last_3m">Last 3 Months</SelectItem>
                <SelectItem value="last_6m">Last 6 Months</SelectItem>
                <SelectItem value="this_fy">{durationItems.this_fy}</SelectItem>
                <SelectItem value="prev_fy">{durationItems.prev_fy}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Live metrics strip */}
          {filtered.length > 0 && (
            <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-4 text-sm">
              <span>
                <span className="text-foreground font-semibold">
                  {filtered.length}
                </span>{' '}
                bills
              </span>
              <span>
                <span className="text-foreground font-semibold">
                  {formatINR(metrics.totalCollected)}
                </span>{' '}
                collected
              </span>
              <span>
                <span className="text-foreground font-semibold">
                  {formatINR(metrics.totalOutstanding)}
                </span>{' '}
                outstanding
              </span>
              <span>
                <span className="text-foreground font-semibold">
                  {metrics.paymentCount}
                </span>{' '}
                payments
              </span>
            </div>
          )}
        </div>

        {isEmpty ? (
          <p className="text-muted-foreground text-sm">No bills to show yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No bills match the selected filters.
          </p>
        ) : (
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%]" />
                  <TableHead className="w-[1%]" />
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((bill) => {
                  const status = displayBillStatus(bill);
                  const outstanding = bill.total_amount - bill.paid_amount;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="text-muted-foreground font-medium">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {bill.unit_no}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {bill.bill_no}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {outstanding > 0 ? (
                          <span className="text-red-600">
                            {formatINR(outstanding)}
                          </span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            billStatusBadgeClassName(status),
                            'border-0 bg-transparent px-0 font-bold shadow-none',
                          )}
                        >
                          <span
                            className={cn(
                              'mr-2 inline-block h-2 w-2 rounded-full',
                              status === 'Paid'
                                ? 'bg-green-500'
                                : status === 'Overdue'
                                  ? 'bg-red-500'
                                  : status === 'Partial'
                                    ? 'bg-orange-500'
                                    : 'bg-yellow-500',
                            )}
                          />
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[1%] text-right whitespace-nowrap">
                        <BillPaymentsDialog
                          billId={bill.id}
                          billNo={bill.bill_no}
                          associationId={props.associationId}
                          payments={bill.payments}
                        />
                      </TableCell>
                      <TableCell className="w-[1%] text-right whitespace-nowrap">
                        {props.canManage && outstanding > 0 ? (
                          <RecordPaymentDialog
                            billId={bill.id}
                            billNo={bill.bill_no}
                            associationId={props.associationId}
                            outstanding={outstanding}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="w-[1%] text-right whitespace-nowrap">
                        {props.canPay && props.paidByRole && outstanding > 0 ? (
                          <RazorpayCheckoutButton
                            associationId={props.associationId}
                            bills={[
                              {
                                id: bill.id,
                                billNo: bill.bill_no,
                                outstanding,
                              },
                            ]}
                            paidByRole={props.paidByRole}
                            variant="outline"
                            onSuccess={onPaymentSuccess}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="bg-muted/10 mt-4 rounded-b-lg border-t px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Showing{' '}
                    <span className="text-foreground font-medium">
                      {(safePage - 1) * PAGE_SIZE + 1}–
                      {Math.min(safePage * PAGE_SIZE, filtered.length)}
                    </span>{' '}
                    of{' '}
                    <span className="text-foreground font-medium">
                      {filtered.length}
                    </span>{' '}
                    bills
                  </p>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>

                    <span className="text-muted-foreground px-3 text-sm">
                      {safePage} / {totalPages}
                    </span>

                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={safePage === totalPages}
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
