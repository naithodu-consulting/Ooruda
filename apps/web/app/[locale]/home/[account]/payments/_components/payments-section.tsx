'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';

import { billTypeLabel } from '@kit/pdf-templates';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { MultiSelect } from '@kit/ui/multi-select';
import type { MultiSelectOption } from '@kit/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { getDurationItems } from '~/lib/bill-filter-items';
import { getPeriodsForDuration } from '~/lib/bill-period-filter';
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { DangerZoneDeleteAll } from '../../_components/danger-zone-delete-all';
import { deleteAllPaymentsAction } from '../_lib/payments-actions';
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
  advance_applied: number;
  status: string;
  due_date: string;
  tenancy_id: string | null;
  payments: PaymentRow[];
}

const PAGE_SIZE = 25;
const ALL_UNITS = '__all__';

const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'Paid', label: 'Paid' },
  { value: 'Unpaid', label: 'Unpaid' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Overdue', label: 'Overdue' },
];

const TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'other_charges', label: 'Other Charges' },
  { value: 'sinking_fund', label: 'Sinking Fund' },
];

export function PaymentsSection(props: {
  associationId: string;
  bills: BillPaymentRow[];
  canManage: boolean;
  canVoid: boolean;
  isSuperAdmin?: boolean;
  deletionCounts?: { payments: number; receipts: number } | null;
  canPay?: boolean;
  paidByRole?: 'Owner' | 'Tenant';
  title?: string;
  description?: string;
  accountSlug?: string;
  initialDuration?: string;
  initialStatus?: string;
  hideUnitColumn?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onPaymentSuccess = useCallback(() => router.refresh(), [router]);

  // Multi-select filters
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    const s = props.initialStatus;
    if (!s || s === 'all') return [];
    // Backward compat: old URL values are lowercase — capitalise first letter.
    return [s.charAt(0).toUpperCase() + s.slice(1)];
  });
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [durationVal, setDurationVal] = useState(
    props.initialDuration ?? 'all',
  );
  // unitTab is kept exclusively for the owner/tenant pill UI (controls Pay All scope).
  const [unitTab, setUnitTab] = useState(
    () => searchParams.get('unit') ?? ALL_UNITS,
  );
  const [page, setPage] = useState(1);

  // Distinct units — for pill tabs (owner/tenant) and MultiSelect (admin)
  const unitList = useMemo(() => {
    const seen = new Set<string>();
    const units: string[] = [];
    for (const b of props.bills) {
      if (!seen.has(b.unit_no)) {
        seen.add(b.unit_no);
        units.push(b.unit_no);
      }
    }
    return units.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [props.bills]);

  const unitOptions = useMemo(
    (): MultiSelectOption[] => unitList.map((u) => ({ value: u, label: u })),
    [unitList],
  );

  const durationItems = useMemo(() => getDurationItems(), []);

  const hasActiveFilters =
    statusFilter.length > 0 ||
    typeFilter.length > 0 ||
    unitFilter.length > 0 ||
    durationVal !== 'all';

  function clearAllFilters() {
    setStatusFilter([]);
    setTypeFilter([]);
    setUnitFilter([]);
    setDurationVal('all');
    setPage(1);
  }

  // Derived: filtered rows (instant — no network)
  const filtered = useMemo(() => {
    let rows = props.bills;

    // Owner/tenant unit pill selection (single-unit scope for Pay All)
    if (props.canPay && unitTab !== ALL_UNITS) {
      rows = rows.filter((b) => b.unit_no === unitTab);
    }

    // Admin unit multi-select filter
    if (!props.canPay && unitFilter.length > 0) {
      rows = rows.filter((b) => unitFilter.includes(b.unit_no));
    }

    // Status multi-select — filter on displayBillStatus (handles Overdue promotion)
    if (statusFilter.length > 0) {
      rows = rows.filter((b) => statusFilter.includes(displayBillStatus(b)));
    }

    // Type multi-select
    if (typeFilter.length > 0) {
      rows = rows.filter((b) => typeFilter.includes(b.bill_type));
    }

    // Duration single-select (date range concept — multi doesn't apply)
    if (durationVal !== 'all') {
      const periods = getPeriodsForDuration(durationVal);
      if (periods) {
        const set = new Set(periods);
        rows = rows.filter((b) => set.has(b.period));
      }
    }

    return rows;
  }, [
    props.bills,
    props.canPay,
    unitTab,
    unitFilter,
    statusFilter,
    typeFilter,
    durationVal,
  ]);

  // Derived: summary metrics
  const metrics = useMemo(() => {
    const totalBilled = filtered.reduce((s, b) => s + b.total_amount, 0);
    // Collected = cash payments + advance credits applied to bills
    const totalCollected = filtered.reduce(
      (s, b) => s + b.paid_amount + b.advance_applied,
      0,
    );
    const paymentCount = filtered.reduce((s, b) => s + b.payments.length, 0);
    return {
      totalBilled,
      totalCollected,
      totalOutstanding: Math.max(0, totalBilled - totalCollected),
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

  const handleDuration = (val: string | null) => {
    setDurationVal(val ?? 'all');
    setPage(1);
  };

  const handleUnitTab = (unit: string) => {
    setUnitTab(unit);
    setPage(1);
    // Sync the URL so deep-linking and back-button reflect the selected unit.
    const params = new URLSearchParams(searchParams.toString());
    if (unit === ALL_UNITS) {
      params.delete('unit');
    } else {
      params.set('unit', unit);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
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
        // Must subtract advance_applied too — otherwise "Pay All" re-charges the
        // portion already covered by an applied advance.
        outstanding: Math.max(
          0,
          b.total_amount - b.paid_amount - b.advance_applied,
        ),
      }))
      .filter((b) => b.outstanding > 0);
  }, [props.bills, unitTab]);

  const [zipLoading, setZipLoading] = useState(false);

  // Cash payment IDs and advance voucher nos — separate because they hit different PDF routes
  const { zipPaymentIds, zipAdvanceVoucherNos } = useMemo(() => {
    const paymentIds: string[] = [];
    const advanceVoucherNos: string[] = [];
    for (const b of filtered) {
      for (const p of b.payments) {
        if (p.is_advance && p.receipt_no) {
          advanceVoucherNos.push(p.receipt_no);
        } else if (!p.is_advance) {
          paymentIds.push(p.id);
        }
      }
    }
    return {
      zipPaymentIds: paymentIds,
      zipAdvanceVoucherNos: advanceVoucherNos,
    };
  }, [filtered]);

  const totalReceiptCount = zipPaymentIds.length + zipAdvanceVoucherNos.length;

  async function handleDownloadReceipts() {
    if (zipLoading || totalReceiptCount === 0 || !props.accountSlug) return;
    setZipLoading(true);
    const toastId = toast.loading('Preparing receipts…');
    try {
      const res = await fetch('/api/billing/payments/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIds: zipPaymentIds,
          advanceVoucherNos: zipAdvanceVoucherNos,
          accountSlug: props.accountSlug,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipts-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss(toastId);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      toast.dismiss(toastId);
      toast.error('Download failed — please try again.');
    } finally {
      setZipLoading(false);
    }
  }

  const isEmpty = props.bills.length === 0 && !hasActiveFilters;

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
          <div className="flex items-center gap-2">
            {props.canPay && props.paidByRole && allPendingBills.length > 1 && (
              <RazorpayCheckoutButton
                associationId={props.associationId}
                bills={allPendingBills}
                paidByRole={props.paidByRole}
                onSuccess={onPaymentSuccess}
              />
            )}
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
          </div>
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
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-4">
          <MultiSelect
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onSelectionChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            placeholder="All statuses"
            summaryLabel="Status"
            maxShownLabels={2}
            data-test="payments-status-filter"
          />
          <MultiSelect
            options={TYPE_OPTIONS}
            selected={typeFilter}
            onSelectionChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            placeholder="All types"
            summaryLabel="Type"
            maxShownLabels={1}
            data-test="payments-type-filter"
          />
          {/* Unit multi-select only for admin — owner/tenant use pill tabs */}
          {!props.canPay && unitOptions.length > 1 && (
            <MultiSelect
              options={unitOptions}
              selected={unitFilter}
              onSelectionChange={(v) => {
                setUnitFilter(v);
                setPage(1);
              }}
              placeholder="All units"
              summaryLabel="Unit"
              maxShownLabels={2}
              data-test="payments-unit-filter"
            />
          )}
          <Select
            items={durationItems}
            value={durationVal}
            onValueChange={handleDuration}
          >
            <SelectTrigger
              className={cn(
                'bg-background h-9 w-[160px] text-xs font-normal [&_svg]:size-3.5',
                durationVal === 'all' && 'text-muted-foreground',
              )}
              data-test="payments-duration-filter"
            >
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

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-9 text-xs"
              onClick={clearAllFilters}
              data-test="payments-clear-filters"
            >
              Clear all
            </Button>
          )}

          {props.canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={totalReceiptCount === 0 || zipLoading}
              onClick={handleDownloadReceipts}
              className="h-9 gap-1.5 text-xs font-semibold"
              data-test="download-receipts-btn"
            >
              {zipLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Download Receipts ({totalReceiptCount})
            </Button>
          )}

          {/* Live metrics strip */}
          {filtered.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {[
                { label: 'Bills', value: String(filtered.length) },
                {
                  label: props.canPay ? 'Paid' : 'Collected',
                  value: formatINR(Math.round(metrics.totalCollected)),
                },
                {
                  label: props.canPay ? 'Bills due' : 'Outstanding',
                  value: formatINR(Math.round(metrics.totalOutstanding)),
                  highlight: metrics.totalOutstanding > 0,
                },
                { label: 'Payments', value: String(metrics.paymentCount) },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className="bg-muted/50 flex flex-col items-center rounded-md px-2.5 py-1.5 text-center"
                >
                  <span
                    className={`text-sm font-semibold tabular-nums ${highlight ? 'text-destructive' : 'text-foreground'}`}
                  >
                    {value}
                  </span>
                  <span className="text-muted-foreground text-[11px] font-medium">
                    {label}
                  </span>
                </div>
              ))}
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
                  <TableHead scope="col">Period</TableHead>
                  {!props.hideUnitColumn && (
                    <TableHead scope="col">Unit</TableHead>
                  )}
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Bill No.</TableHead>
                  <TableHead scope="col" className="text-right">
                    Total
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount Owed
                  </TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead className="w-[1%]" />
                  <TableHead className="w-[1%]" />
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((bill) => {
                  const status = displayBillStatus(bill);
                  const outstanding = Math.max(
                    0,
                    bill.total_amount - bill.paid_amount - bill.advance_applied,
                  );

                  const isOverdue = status === 'Overdue';
                  return (
                    <TableRow
                      key={bill.id}
                      className={isOverdue ? 'bg-destructive/[0.04]' : ''}
                    >
                      <TableCell className="text-muted-foreground text-sm">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      {!props.hideUnitColumn && (
                        <TableCell className="font-medium">
                          {bill.unit_no}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground text-sm">
                        {billTypeLabel(bill.bill_type)}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground max-w-[180px] truncate text-sm"
                        title={bill.bill_no}
                      >
                        {bill.bill_no}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {outstanding > 0 ? (
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {formatINR(outstanding)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">₹0</span>
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
                          hidePayerColumn={props.canPay}
                        />
                      </TableCell>
                      <TableCell className="w-[1%] text-right whitespace-nowrap">
                        {props.canManage && outstanding > 0 ? (
                          <RecordPaymentDialog
                            billId={bill.id}
                            billNo={bill.bill_no}
                            associationId={props.associationId}
                            outstanding={outstanding}
                            hasTenancy={bill.tenancy_id != null}
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
                            variant="default"
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
