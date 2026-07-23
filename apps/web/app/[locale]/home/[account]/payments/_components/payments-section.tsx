'use client';

import { useMemo, useState } from 'react';

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
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { DangerZoneDeleteAll } from '../../_components/danger-zone-delete-all';
import { deleteAllPaymentsAction } from '../_lib/payments-actions';
import { BillPaymentsDialog, type PaymentRow } from './bill-payments-dialog';
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

export function PaymentsSection(props: {
  associationId: string;
  bills: BillPaymentRow[];
  canManage: boolean;
  canVoid: boolean;
  isSuperAdmin?: boolean;
  deletionCounts?: { payments: number; receipts: number } | null;
  title?: string;
  description?: string;
  accountSlug?: string;
  initialDuration?: string;
  initialStatus?: string;
}) {
  const [statusVal, setStatusVal] = useState(props.initialStatus ?? 'all');
  const [typeVal, setTypeVal] = useState('all');
  const [unitVal, setUnitVal] = useState('all');
  const [durationVal, setDurationVal] = useState(
    props.initialDuration ?? 'all',
  );
  const [page, setPage] = useState(1);

  const durationItems = useMemo(() => getDurationItems(), []);
  // Derived: filtered rows (instant — no network)
  const filtered = useMemo(() => {
    let rows = props.bills;

    if (statusVal !== 'all') {
      if (statusVal === 'collected') {
        // Collected = any bill with money received (Paid or Partial)
        rows = rows.filter(
          (b) => b.status === 'Paid' || b.status === 'Partial',
        );
      } else if (statusVal === 'paid') {
        rows = rows.filter((b) => b.status === 'Paid');
      } else if (statusVal === 'unpaid') {
        rows = rows.filter((b) => displayBillStatus(b) === 'Unpaid');
      } else if (statusVal === 'partial') {
        rows = rows.filter((b) => displayBillStatus(b) === 'Partial');
      } else if (statusVal === 'overdue') {
        rows = rows.filter((b) => displayBillStatus(b) === 'Overdue');
      }
    }

    if (typeVal !== 'all') {
      rows = rows.filter((b) => b.bill_type === typeVal);
    }

    if (unitVal !== 'all') {
      rows = rows.filter((b) => b.unit_no === unitVal);
    }

    if (durationVal !== 'all') {
      const periods = getPeriodsForDuration(durationVal);
      if (periods) {
        const set = new Set(periods);
        rows = rows.filter((b) => set.has(b.period));
      }
    }

    return rows;
  }, [props.bills, statusVal, typeVal, unitVal, durationVal]);

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

  const unitOptions = useMemo(() => {
    const seen = new Set<string>();
    return props.bills
      .map((b) => b.unit_no)
      .filter((u) => u && !seen.has(u) && seen.add(u));
  }, [props.bills]);

  const unitSelectItems = useMemo(
    () =>
      ({
        all: 'All Units',
        ...Object.fromEntries(unitOptions.map((u) => [u, u])),
      }) as Record<string, string>,
    [unitOptions],
  );

  const isEmpty =
    props.bills.length === 0 &&
    statusVal === 'all' &&
    typeVal === 'all' &&
    durationVal === 'all';

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{props.title ?? 'Payments'}</CardTitle>
          <CardDescription>
            {props.description ??
              'Record payments against bills and track receipts.'}
          </CardDescription>
        </div>

        {props.isSuperAdmin && props.deletionCounts ? (
          <DangerZoneDeleteAll
            confirmValue={props.accountSlug ?? ''}
            buttonLabel="Delete all payments"
            dialogTitle="Delete all payments for this association?"
            description={`This permanently deletes ${props.deletionCounts.payments} payments and ${props.deletionCounts.receipts} receipts. Bills themselves are kept and revert to their unpaid state. This cannot be undone.`}
            disabled={props.deletionCounts.payments === 0}
            onDelete={() => deleteAllPaymentsAction(props.associationId)}
            formatSuccessMessage={(result) =>
              `Deleted ${result.deletedPayments ?? 0} payments, ${result.deletedReceipts ?? 0} receipts.`
            }
          />
        ) : null}
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

          {unitOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                Unit
              </span>
              <Select
                items={unitSelectItems}
                value={unitVal}
                onValueChange={setFilter(setUnitVal)}
              >
                <SelectTrigger className="bg-background h-9 w-[120px]">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Units</SelectItem>
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
          <div className="w-full overflow-x-auto">
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
