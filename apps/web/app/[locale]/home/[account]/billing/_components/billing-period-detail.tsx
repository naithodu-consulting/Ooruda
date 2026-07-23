'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  TrendingUp,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { MetricCard } from '@kit/ui/metric-card';
import { MultiSelect } from '@kit/ui/multi-select';
import type { MultiSelectOption } from '@kit/ui/multi-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { BillingUnitSheet } from './billing-unit-sheet';
import type { BillRow } from './bills-section';

const BILL_TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'other_charges', label: 'Other Charges' },
  { value: 'sinking_fund', label: 'Sinking Fund' },
];

const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'Paid', label: 'Paid' },
  { value: 'Unpaid', label: 'Unpaid' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Overdue', label: 'Overdue' },
];

const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
};

export function BillingPeriodDetail(props: {
  bills: BillRow[];
  period: string;
  accountSlug: string;
}) {
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Bills for this period only
  const periodBills = useMemo(
    () => props.bills.filter((b) => b.period === props.period),
    [props.bills, props.period],
  );

  // Unique units for filter options
  const unitOptions = useMemo((): MultiSelectOption[] => {
    const seen = new Set<string>();
    const opts: MultiSelectOption[] = [];
    for (const b of periodBills) {
      if (!seen.has(b.unit_no)) {
        seen.add(b.unit_no);
        opts.push({ value: b.unit_no, label: b.unit_no });
      }
    }
    return opts.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  }, [periodBills]);

  // Apply filters
  const filteredBills = useMemo(() => {
    let rows = periodBills;
    if (typeFilter.length > 0) {
      rows = rows.filter((b) => typeFilter.includes(b.bill_type));
    }
    if (unitFilter.length > 0) {
      rows = rows.filter((b) => unitFilter.includes(b.unit_no));
    }
    if (statusFilter.length > 0) {
      rows = rows.filter((b) => {
        const ds = displayBillStatus(b);
        return statusFilter.includes(ds);
      });
    }
    return rows;
  }, [periodBills, typeFilter, unitFilter, statusFilter]);

  // KPIs for this period
  const kpis = useMemo(() => {
    const overdue = periodBills.filter(
      (b) => displayBillStatus(b) === 'Overdue',
    );
    return {
      totalBilled: periodBills.reduce((s, b) => s + b.total_amount, 0),
      totalCollected: periodBills.reduce((s, b) => s + b.paid_amount, 0),
      outstanding: periodBills.reduce(
        (s, b) => s + Math.max(0, b.total_amount - b.paid_amount),
        0,
      ),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce(
        (s, b) => s + (b.total_amount - b.paid_amount),
        0,
      ),
      paidCount: periodBills.filter((b) => displayBillStatus(b) === 'Paid')
        .length,
      total: periodBills.length,
    };
  }, [periodBills]);

  const collectionPct =
    kpis.totalBilled > 0
      ? Math.round((kpis.totalCollected / kpis.totalBilled) * 100)
      : 100;

  function openBill(bill: BillRow) {
    setSelectedBill(bill);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="space-y-6">
        {/* Back navigation */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2 gap-1.5"
            render={
              <Link
                href={`/home/${props.accountSlug}/billing`}
                data-test="back-to-overview"
              />
            }
          >
            <ArrowLeft className="size-3.5" />
            Back to Overview
          </Button>
          <h2 className="mt-1 text-xl font-bold">
            {formatPeriod(props.period)}
          </h2>
          <p className="text-muted-foreground text-sm">
            {periodBills.length} bills · {collectionPct}% collected
          </p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            icon={TrendingUp}
            label="Total Billed"
            value={formatINR(kpis.totalBilled)}
            sublabel={`${collectionPct}% collected`}
            variant="blue"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Collected"
            value={formatINR(kpis.totalCollected)}
            sublabel={`${kpis.paidCount} fully paid`}
            variant="green"
          />
          <MetricCard
            icon={FileText}
            label="Outstanding"
            value={formatINR(kpis.outstanding)}
            sublabel={`${kpis.total - kpis.paidCount} unpaid`}
            variant="amber"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Overdue"
            value={formatINR(kpis.overdueAmount)}
            sublabel={`${kpis.overdueCount} bill${kpis.overdueCount !== 1 ? 's' : ''}`}
            variant={kpis.overdueCount > 0 ? 'red' : 'green'}
          />
        </div>

        {/* Filters + table */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelect
              options={unitOptions}
              selected={unitFilter}
              onSelectionChange={setUnitFilter}
              placeholder="All units"
              summaryLabel="Unit"
              maxShownLabels={2}
              data-test="period-unit-filter"
            />
            <MultiSelect
              options={BILL_TYPE_OPTIONS}
              selected={typeFilter}
              onSelectionChange={setTypeFilter}
              placeholder="All types"
              summaryLabel="Type"
              maxShownLabels={1}
              data-test="period-type-filter"
            />
            <MultiSelect
              options={STATUS_OPTIONS}
              selected={statusFilter}
              onSelectionChange={setStatusFilter}
              placeholder="All statuses"
              summaryLabel="Status"
              maxShownLabels={1}
              data-test="period-status-filter"
            />
            {(typeFilter.length > 0 ||
              statusFilter.length > 0 ||
              unitFilter.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-9 text-xs"
                onClick={() => {
                  setTypeFilter([]);
                  setStatusFilter([]);
                  setUnitFilter([]);
                }}
                data-test="clear-filters"
              >
                Clear all
              </Button>
            )}
            <span className="text-muted-foreground ml-auto text-xs">
              {filteredBills.length} of {periodBills.length} bills
            </span>
          </div>

          {filteredBills.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
              No bills match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-24">Unit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="w-24 text-center">Status</TableHead>
                    <TableHead className="w-28">Due Date</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => {
                    const ds = displayBillStatus(bill);
                    const outstanding = Math.max(
                      0,
                      bill.total_amount - bill.paid_amount,
                    );
                    return (
                      <TableRow
                        key={bill.id}
                        className="cursor-pointer"
                        onClick={() => openBill(bill)}
                        data-test={`bill-row-${bill.id}`}
                      >
                        <TableCell className="font-medium">
                          {bill.unit_no}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {BILL_TYPE_LABELS[bill.bill_type] ?? bill.bill_type}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatINR(bill.total_amount)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-green-700 tabular-nums dark:text-green-400">
                          {bill.paid_amount > 0
                            ? formatINR(bill.paid_amount)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {outstanding > 0 ? (
                            <span className="text-amber-700 dark:text-amber-400">
                              {formatINR(outstanding)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              billStatusBadgeClassName(ds),
                            )}
                          >
                            {ds}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {bill.due_date
                            ? new Date(
                                bill.due_date.replace(/-/g, '/'),
                              ).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="text-muted-foreground size-4" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <BillingUnitSheet
        bill={selectedBill}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
