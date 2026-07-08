'use client';

import { useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { DownloadPdfButton } from '~/components/download-pdf-button';
import {
  BILL_STATUS_ITEMS,
  BILL_TYPE_FILTER_ITEMS,
  getDurationItems,
} from '~/lib/bill-filter-items';
import { getPeriodsForDuration } from '~/lib/bill-period-filter';
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';

import {
  generateBillsAction,
  type PendingOtherCharge,
} from '../_lib/billing-actions';
import { GenerateBillsSchema } from '../_lib/billing-schema';
import {
  BillLineItemsDialog,
  type BillLineItemRow,
} from './bill-line-items-dialog';
import { OtherChargesDialog } from './other-charges-dialog';

const BILL_TYPE_ITEMS = {
  All: 'All Bills',
  Maintenance: 'Maintenance',
  Electricity: 'Electricity',
  'Other Charges': 'Other Charges',
};

const PAGE_SIZE = 25;

export interface BillRow {
  id: string;
  period: string;
  bill_no: string;
  bill_type: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  unit_no: string;
  gst_amount: number | null;
  lineItems: BillLineItemRow[];
}

interface PendingChargeWithUnit extends PendingOtherCharge {
  unit_no?: string | null;
  period: string;
}

export function BillsSection(props: {
  associationId: string;
  bills: BillRow[];
  canManage: boolean;
  canDelete: boolean;
  units?: { id: string; unit_no: string }[];
  pendingCharges?: PendingChargeWithUnit[];
  periodOptions?: string[];
  isOtherChargesActive: boolean;
  accountSlug?: string;
  initialDuration?: string;
  initialStatus?: string;
}) {
  const [statusVal, setStatusVal] = useState(props.initialStatus ?? 'all');
  const [typeVal, setTypeVal] = useState('all');
  const [durationVal, setDurationVal] = useState(
    props.initialDuration ?? 'all',
  );
  const [page, setPage] = useState(1);

  const durationItems = useMemo(() => getDurationItems(), []);
  const today = useMemo(() => todayInBillingZone(), []);

  // Derived: filtered rows (instant — no network)
  const filtered = useMemo(() => {
    let rows = props.bills;

    if (statusVal !== 'all') {
      if (statusVal === 'paid') {
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
            (b.status === 'Unpaid' || b.status === 'Partial') &&
            b.due_date < today,
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
  }, [props.bills, statusVal, typeVal, durationVal, today]);

  // Derived: summary metrics over filtered set
  const metrics = useMemo(() => {
    const totalBilled = filtered.reduce((s, b) => s + b.total_amount, 0);
    const totalCollected = filtered.reduce((s, b) => s + b.paid_amount, 0);
    return {
      totalBilled,
      totalCollected,
      totalOutstanding: totalBilled - totalCollected,
      overdueCount: filtered.filter((b) => displayBillStatus(b) === 'Overdue')
        .length,
    };
  }, [filtered]);

  // Derived: current page rows
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

  const isEmpty =
    props.bills.length === 0 &&
    statusVal === 'all' &&
    typeVal === 'all' &&
    durationVal === 'all';

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>Bills</CardTitle>
        </div>

        {props.canManage ? (
          <div className="flex items-center gap-2 sm:shrink-0">
            {props.isOtherChargesActive &&
              props.units &&
              props.periodOptions && (
                <OtherChargesDialog
                  associationId={props.associationId}
                  units={props.units}
                  pendingCharges={props.pendingCharges ?? []}
                  periods={props.periodOptions}
                />
              )}
            <GenerateBillsDialog associationId={props.associationId} />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5">
        {isEmpty ? (
          <p className="text-muted-foreground text-sm">
            No bills generated yet.
          </p>
        ) : (
          <>
            {/* Filters */}
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
                    <SelectItem value="this_fy">
                      {durationItems.this_fy}
                    </SelectItem>
                    <SelectItem value="prev_fy">
                      {durationItems.prev_fy}
                    </SelectItem>
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
                  {metrics.overdueCount > 0 && (
                    <span className="font-semibold text-red-600">
                      {metrics.overdueCount} overdue
                    </span>
                  )}
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No bills match the selected filters.
              </p>
            ) : (
              <>
                <div className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill No.</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">
                          Maintenance
                        </TableHead>
                        <TableHead className="text-right">
                          Electricity
                        </TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((bill) => {
                        const status = displayBillStatus(bill);
                        const maintenanceLine = bill.lineItems.find((li) =>
                          li.description.toLowerCase().includes('maintenance'),
                        );
                        const electricityLine = bill.lineItems.find((li) =>
                          li.description.toLowerCase().includes('electricity'),
                        );

                        return (
                          <TableRow key={bill.id}>
                            <TableCell className="text-muted-foreground font-medium">
                              {bill.bill_no}
                            </TableCell>
                            <TableCell className="font-semibold">
                              {bill.unit_no}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {maintenanceLine
                                ? formatINR(maintenanceLine.amount)
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {electricityLine
                                ? formatINR(electricityLine.amount)
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right font-bold tabular-nums">
                              {formatINR(bill.total_amount)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatINR(bill.paid_amount)}
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
                            <TableCell>
                              <div className="flex items-center justify-end gap-2">
                                <BillLineItemsDialog
                                  billNo={bill.bill_no}
                                  period={bill.period}
                                  lineItems={bill.lineItems}
                                  gstAmount={bill.gst_amount}
                                />
                                <DownloadPdfButton
                                  href={`/api/billing/bills/${bill.id}/pdf`}
                                  label="Download bill PDF"
                                  dataTest={`download-bill-${bill.id}`}
                                  showLabel
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-muted/10 rounded-b-lg border-t px-4 py-3">
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
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GenerateBillsDialog(props: { associationId: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" data-test="generate-bills-trigger">
            <Plus className="h-4 w-4" />
            Generate Bills
          </Button>
        }
      />

      <DialogContent>
        {!confirming && (
          <DialogHeader>
            <DialogTitle>Generate bills for a period</DialogTitle>
            <DialogDescription>
              Creates a bill for every unit for the selected period and bill
              type.
            </DialogDescription>
          </DialogHeader>
        )}

        <GenerateBillsForm
          associationId={props.associationId}
          confirming={confirming}
          setConfirming={setConfirming}
          onDone={() => {
            setOpen(false);
            setConfirming(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateBillsForm(props: {
  associationId: string;
  confirming: boolean;
  setConfirming: (value: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { confirming, setConfirming } = props;

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const periodOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() - 6 + i, 1);
      return {
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      };
    });
  }, []);

  const form = useForm({
    resolver: zodResolver(GenerateBillsSchema),
    defaultValues: { period: defaultPeriod, billType: 'All' },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await generateBillsAction(props.associationId, values);

      if (!result.success) {
        toast.error(result.error ?? 'Could not generate bills.');
        return;
      }

      toast.success(
        `${result.created ?? 0} bill(s) created${
          result.skipped ? `, ${result.skipped} already billed` : ''
        }.`,
      );
      props.onDone();
      router.refresh();
    });
  });

  if (confirming) {
    return (
      <div className="flex flex-col gap-4" role="alertdialog" aria-modal="true">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base leading-snug font-medium">Generate Bills</h3>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to generate bills for this period? Once
            generated, bills cannot be deleted or modified.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setConfirming(false)}
            data-test="generate-bills-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={onSubmit}
            data-test="generate-bills-confirm"
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Confirm Generation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.trigger().then((valid) => {
            if (valid) setConfirming(true);
          });
        }}
        className="flex flex-col gap-4"
      >
        <FormField
          name="billType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bill Type</FormLabel>
              <FormControl>
                <Select
                  items={BILL_TYPE_ITEMS}
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Bill Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Bills</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Electricity">Electricity</SelectItem>
                    <SelectItem value="Other Charges">Other Charges</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Period</FormLabel>
              <FormControl>
                <Select
                  items={periodOptions}
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                Units that already have a bill for this period are skipped.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="sm" className="self-start">
          Generate
        </Button>
      </form>
    </Form>
  );
}
