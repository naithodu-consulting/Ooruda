'use client';

import { useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Plus,
  Receipt,
  Wrench,
  Zap,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@kit/ui/tooltip';
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
import { formatPeriod } from '~/lib/format-period';

import { DangerZoneDeleteAll } from '../../_components/danger-zone-delete-all';
import {
  deleteAllBillsAction,
  generateBillsAction,
  type PendingOtherCharge,
  type PendingSinkingFundCharge,
} from '../_lib/billing-actions';
import { GenerateBillsSchema } from '../_lib/billing-schema';
import {
  BillLineItemsDialog,
  type BillLineItemRow,
} from './bill-line-items-dialog';
import { OtherChargesDialog } from './other-charges-dialog';
import { SinkingFundDialog } from './sinking-fund-dialog';

const BILL_TYPE_ITEMS = {
  All: 'All Bills',
  Maintenance: 'Maintenance',
  Electricity: 'Electricity',
  'Other Charges': 'Other Charges',
  'Sinking Fund': 'Sinking Fund',
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

export interface PendingElectricityBill {
  id: string;
  period: string;
  invoice_amount: number;
  block_consumption_units: number;
  uploaded_at: string;
}

interface PendingChargeWithUnit extends PendingOtherCharge {
  unit_no?: string | null;
  period: string;
}

interface PendingSinkingChargeWithUnit extends PendingSinkingFundCharge {
  unit_no?: string | null;
  period: string;
}

export function BillsSection(props: {
  associationId: string;
  bills: BillRow[];
  canManage: boolean;
  canDelete: boolean;
  isSuperAdmin?: boolean;
  deletionCounts?: {
    bills: number;
    payments: number;
    receipts: number;
  } | null;
  units?: { id: string; unit_no: string }[];
  pendingCharges?: PendingChargeWithUnit[];
  periodOptions?: string[];
  isOtherChargesActive: boolean;
  isSinkingFundActive?: boolean;
  pendingSinkingCharges?: PendingSinkingChargeWithUnit[];
  accountSlug?: string;
  initialDuration?: string;
  initialStatus?: string;
  pendingElectricityBills?: PendingElectricityBill[];
  maintenancePending?: boolean;
  currentPeriod?: string;
}) {
  const draftCount =
    (props.maintenancePending ? 1 : 0) +
    ((props.pendingElectricityBills?.length ?? 0) > 0 ? 1 : 0) +
    ((props.pendingCharges?.length ?? 0) > 0 ? 1 : 0) +
    ((props.pendingSinkingCharges?.length ?? 0) > 0 ? 1 : 0);

  // Arriving with a status/duration filter (e.g. from a dashboard tile link)
  // means the caller wants the Generated Bills tab with that filter applied
  // — defaulting to Draft Bills just because a draft happens to be pending
  // would silently strand the requested filter on the wrong tab.
  const hasIncomingFilter = !!(props.initialStatus || props.initialDuration);
  const defaultTab =
    hasIncomingFilter || draftCount === 0 ? 'generated' : 'draft';

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle>Bills</CardTitle>

        <div className="flex items-center gap-2 sm:shrink-0">
          {props.canManage ? (
            <>
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
              {props.isSinkingFundActive &&
                props.units &&
                props.periodOptions && (
                  <SinkingFundDialog
                    associationId={props.associationId}
                    units={props.units}
                    pendingCharges={props.pendingSinkingCharges ?? []}
                    periods={props.periodOptions}
                  />
                )}
              <GenerateBillsDialog associationId={props.associationId} />
            </>
          ) : null}

          {props.isSuperAdmin && props.deletionCounts ? (
            <DangerZoneDeleteAll
              confirmValue={props.accountSlug ?? ''}
              buttonLabel="Delete all bills"
              dialogTitle="Delete all bills for this association?"
              description={`This permanently deletes ${props.deletionCounts.bills} bills, ${props.deletionCounts.payments} payments, and ${props.deletionCounts.receipts} receipts for this association, and resets bill numbering. This cannot be undone.`}
              disabled={props.deletionCounts.bills === 0}
              onDelete={() => deleteAllBillsAction(props.associationId)}
              formatSuccessMessage={(result) =>
                `Deleted ${result.deletedBills ?? 0} bills, ${result.deletedPayments ?? 0} payments, ${result.deletedReceipts ?? 0} receipts.`
              }
            />
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="draft" className="relative">
              Draft Bills
              {draftCount > 0 && (
                <span className="bg-primary text-primary-foreground ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold">
                  {draftCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="generated">
              Generated Bills
              {props.bills.length > 0 && (
                <span className="text-muted-foreground ml-2 text-[11px]">
                  {props.bills.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draft">
            <DraftBillsTab
              associationId={props.associationId}
              maintenancePending={props.maintenancePending ?? false}
              currentPeriod={props.currentPeriod ?? ''}
              pendingElectricityBills={props.pendingElectricityBills ?? []}
              pendingCharges={props.pendingCharges ?? []}
              pendingSinkingCharges={props.pendingSinkingCharges ?? []}
              canManage={props.canManage}
            />
          </TabsContent>

          <TabsContent value="generated">
            <GeneratedBillsTab
              bills={props.bills}
              units={props.units}
              initialDuration={props.initialDuration}
              initialStatus={props.initialStatus}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ── Draft Bills tab ──────────────────────────────────────────────────────────

const DRAFT_PAGE_SIZE = 20;

type DraftTypeFilter =
  | 'all'
  | 'maintenance'
  | 'electricity'
  | 'other_charges'
  | 'sinking_fund';

function DraftBillsTab(props: {
  associationId: string;
  maintenancePending: boolean;
  currentPeriod: string;
  pendingElectricityBills: PendingElectricityBill[];
  pendingCharges: (PendingOtherCharge & {
    unit_no?: string | null;
    period: string;
  })[];
  pendingSinkingCharges: PendingSinkingChargeWithUnit[];
  canManage: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<DraftTypeFilter>('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [chargesPage, setChargesPage] = useState(1);

  const hasAnything =
    props.maintenancePending ||
    props.pendingElectricityBills.length > 0 ||
    props.pendingCharges.length > 0 ||
    props.pendingSinkingCharges.length > 0;

  if (!hasAnything) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No pending drafts. All bills have been generated.
      </p>
    );
  }

  const electricityTotal = props.pendingElectricityBills.reduce(
    (s, mb) => s + mb.invoice_amount,
    0,
  );
  const otherChargesTotal = props.pendingCharges.reduce(
    (s, pc) => s + pc.amount,
    0,
  );
  const sinkingFundTotal = props.pendingSinkingCharges.reduce(
    (s, pc) => s + pc.amount,
    0,
  );

  const totalSections =
    (props.maintenancePending ? 1 : 0) +
    (props.pendingElectricityBills.length > 0 ? 1 : 0) +
    (props.pendingCharges.length > 0 ? 1 : 0) +
    (props.pendingSinkingCharges.length > 0 ? 1 : 0);

  // Collect all unique periods across pending items for the period filter
  const allPeriods = Array.from(
    new Set([
      ...(props.maintenancePending ? [props.currentPeriod] : []),
      ...props.pendingElectricityBills.map((mb) => mb.period),
      ...props.pendingCharges.map((pc) => pc.period),
      ...props.pendingSinkingCharges.map((pc) => pc.period),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  // Apply filters
  const showMaintenance =
    props.maintenancePending &&
    (typeFilter === 'all' || typeFilter === 'maintenance') &&
    (periodFilter === 'all' || periodFilter === props.currentPeriod);

  const filteredElectricity = props.pendingElectricityBills.filter(
    (mb) =>
      (typeFilter === 'all' || typeFilter === 'electricity') &&
      (periodFilter === 'all' || periodFilter === mb.period),
  );

  const filteredCharges = props.pendingCharges.filter(
    (pc) =>
      (typeFilter === 'all' || typeFilter === 'other_charges') &&
      (periodFilter === 'all' || periodFilter === pc.period),
  );

  const filteredSinking = props.pendingSinkingCharges.filter(
    (pc) =>
      (typeFilter === 'all' || typeFilter === 'sinking_fund') &&
      (periodFilter === 'all' || periodFilter === pc.period),
  );

  // Pagination for other charges
  const totalChargesPages = Math.ceil(filteredCharges.length / DRAFT_PAGE_SIZE);
  const pagedCharges = filteredCharges.slice(
    (chargesPage - 1) * DRAFT_PAGE_SIZE,
    chargesPage * DRAFT_PAGE_SIZE,
  );
  const filteredOtherChargesTotal = filteredCharges.reduce(
    (s, pc) => s + pc.amount,
    0,
  );

  const hasFilteredResults =
    showMaintenance ||
    filteredElectricity.length > 0 ||
    filteredCharges.length > 0 ||
    filteredSinking.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b pb-4 text-sm">
        <span>
          <span className="text-foreground font-semibold">{totalSections}</span>{' '}
          <span className="text-muted-foreground">
            draft{totalSections !== 1 ? 's' : ''} pending
          </span>
        </span>
        {props.maintenancePending && (
          <span>
            <span className="text-muted-foreground">Maintenance</span>{' '}
            <span className="text-foreground font-medium">
              {formatPeriod(props.currentPeriod)}
            </span>
          </span>
        )}
        {electricityTotal > 0 && (
          <span>
            <span className="text-muted-foreground">Electricity</span>{' '}
            <span className="text-foreground font-semibold">
              {formatINR(electricityTotal)}
            </span>
          </span>
        )}
        {otherChargesTotal > 0 && (
          <span>
            <span className="text-muted-foreground">Other Charges</span>{' '}
            <span className="text-foreground font-semibold">
              {formatINR(otherChargesTotal)}
            </span>
          </span>
        )}
        {sinkingFundTotal > 0 && (
          <span>
            <span className="text-muted-foreground">Sinking Fund</span>{' '}
            <span className="text-foreground font-semibold">
              {formatINR(sinkingFundTotal)}
            </span>
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
            Type
          </span>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v as DraftTypeFilter);
              setChargesPage(1);
            }}
          >
            <SelectTrigger className="bg-background h-9 w-[150px]">
              <SelectValue>
                {typeFilter === 'all'
                  ? 'All Types'
                  : typeFilter === 'maintenance'
                    ? 'Maintenance'
                    : typeFilter === 'electricity'
                      ? 'Electricity'
                      : typeFilter === 'sinking_fund'
                        ? 'Sinking Fund'
                        : 'Other Charges'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {props.maintenancePending && (
                <SelectItem value="maintenance">Maintenance</SelectItem>
              )}
              {props.pendingElectricityBills.length > 0 && (
                <SelectItem value="electricity">Electricity</SelectItem>
              )}
              {props.pendingCharges.length > 0 && (
                <SelectItem value="other_charges">Other Charges</SelectItem>
              )}
              {props.pendingSinkingCharges.length > 0 && (
                <SelectItem value="sinking_fund">Sinking Fund</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {allPeriods.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Period
            </span>
            <Select
              value={periodFilter}
              onValueChange={(v) => {
                if (v) setPeriodFilter(v);
                setChargesPage(1);
              }}
            >
              <SelectTrigger className="bg-background h-9 w-[150px]">
                <SelectValue>
                  {periodFilter === 'all'
                    ? 'All Periods'
                    : formatPeriod(periodFilter)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {allPeriods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {formatPeriod(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        These bills are staged and not yet visible to residents. Use{' '}
        <span className="text-foreground font-medium">Generate Bills</span> to
        finalise and publish them.
      </p>

      {!hasFilteredResults && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No drafts match the selected filters.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {/* Pending Maintenance */}
        {showMaintenance && (
          <DraftSection
            icon={<Wrench className="h-4 w-4" />}
            title="Maintenance"
            badge={formatPeriod(props.currentPeriod)}
          >
            <p className="text-muted-foreground px-1 text-sm">
              Maintenance bills for{' '}
              <span className="text-foreground font-medium">
                {formatPeriod(props.currentPeriod)}
              </span>{' '}
              haven't been generated yet. All active units will receive a bill
              when you click <span className="font-medium">Generate Bills</span>
              .
            </p>
          </DraftSection>
        )}

        {/* Pending Electricity */}
        {filteredElectricity.length > 0 && (
          <DraftSection
            icon={<Zap className="h-4 w-4" />}
            title="Electricity"
            badge={`${filteredElectricity.length} month${filteredElectricity.length !== 1 ? 's' : ''}`}
            total={filteredElectricity.reduce(
              (s, mb) => s + mb.invoice_amount,
              0,
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Invoice Amount</TableHead>
                  <TableHead className="text-right">Block Units</TableHead>
                  <TableHead className="text-right">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredElectricity.map((mb) => (
                  <TableRow key={mb.id}>
                    <TableCell className="font-medium">
                      {formatPeriod(mb.period)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatINR(mb.invoice_amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {mb.block_consumption_units.toLocaleString('en-IN')} units
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs">
                      {new Date(mb.uploaded_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DraftSection>
        )}

        {/* Pending Sinking Fund */}
        {filteredSinking.length > 0 && (
          <DraftSection
            icon={<PiggyBank className="h-4 w-4" />}
            title="Sinking Fund"
            badge={`${filteredSinking.length} charge${filteredSinking.length !== 1 ? 's' : ''}`}
            total={filteredSinking.reduce((s, pc) => s + pc.amount, 0)}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSinking.map((pc) => (
                  <TableRow key={pc.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatPeriod(pc.period)}
                    </TableCell>
                    <TableCell className="font-medium">{pc.label}</TableCell>
                    <TableCell className="text-sm">
                      {pc.unit_no ?? (
                        <span className="text-muted-foreground">
                          All units
                          {pc.split_mode === 'per_sqft' ? ' (per sqft)' : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatINR(pc.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3} className="text-sm">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(
                      filteredSinking.reduce((s, pc) => s + pc.amount, 0),
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </DraftSection>
        )}

        {/* Pending Other Charges */}
        {filteredCharges.length > 0 && (
          <DraftSection
            icon={<Receipt className="h-4 w-4" />}
            title="Other Charges"
            badge={`${filteredCharges.length} charge${filteredCharges.length !== 1 ? 's' : ''}`}
            total={filteredOtherChargesTotal}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedCharges.map((pc) => (
                  <TableRow key={pc.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatPeriod(pc.period)}
                    </TableCell>
                    <TableCell className="font-medium">{pc.label}</TableCell>
                    <TableCell className="text-sm">
                      {pc.unit_no ?? (
                        <span className="text-muted-foreground">
                          All units
                          {pc.split_mode === 'per_sqft' ? ' (per sqft)' : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatINR(pc.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Subtotal row */}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3} className="text-sm">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(filteredOtherChargesTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {/* Pagination for other charges */}
            {totalChargesPages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                <span className="text-muted-foreground">
                  {(chargesPage - 1) * DRAFT_PAGE_SIZE + 1}–
                  {Math.min(
                    chargesPage * DRAFT_PAGE_SIZE,
                    filteredCharges.length,
                  )}{' '}
                  of {filteredCharges.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={chargesPage === 1}
                  onClick={() => setChargesPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={chargesPage === totalChargesPages}
                  onClick={() => setChargesPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </DraftSection>
        )}
      </div>
    </div>
  );
}

function DraftSection(props: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  total?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{props.icon}</span>
        <span className="text-sm font-semibold">{props.title}</span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
          {props.badge}
        </span>
        {props.total != null && (
          <span className="text-foreground ml-auto text-sm font-bold tabular-nums">
            {formatINR(props.total)}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">{props.children}</div>
    </div>
  );
}

// ── Generated Bills tab ──────────────────────────────────────────────────────

function GeneratedBillsTab(props: {
  bills: BillRow[];
  units?: { id: string; unit_no: string }[];
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
  const today = useMemo(() => todayInBillingZone(), []);

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
            b.status === 'Overdue' ||
            ((b.status === 'Unpaid' || b.status === 'Partial') &&
              b.due_date < today),
        );
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
  }, [props.bills, statusVal, typeVal, unitVal, durationVal, today]);

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

  if (props.bills.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No bills generated yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
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
              <SelectItem value="sinking_fund">Sinking Fund</SelectItem>
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
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill No.</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Breakdown</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((bill) => {
                  const status = displayBillStatus(bill);
                  const breakdownItems = bill.lineItems
                    .filter((li) => li.amount > 0)
                    .map((li) => {
                      const desc = li.description.toLowerCase();
                      const icon = desc.includes('electricity')
                        ? '⚡'
                        : desc.includes('maintenance')
                          ? '🔧'
                          : '📄';
                      return { icon, label: li.description, amount: li.amount };
                    });

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="text-muted-foreground font-medium">
                        {bill.bill_no}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {bill.unit_no}
                      </TableCell>
                      <TableCell>
                        {breakdownItems.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {breakdownItems.map((item, i) => (
                              <span
                                key={i}
                                className="text-muted-foreground flex items-center gap-1 text-xs tabular-nums"
                              >
                                <span>{item.icon}</span>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span className="max-w-[120px] truncate">
                                      {item.label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{item.label}</TooltipContent>
                                </Tooltip>
                                <span className="text-foreground ml-auto pl-2 font-medium">
                                  {formatINR(item.amount)}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
    </div>
  );
}

// ── Generate Bills dialog ────────────────────────────────────────────────────

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
    defaultValues: { period: defaultPeriod, billType: undefined },
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
                  value={field.value ?? ''}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bill type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Bills</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Electricity">Electricity</SelectItem>
                    <SelectItem value="Other Charges">Other Charges</SelectItem>
                    <SelectItem value="Sinking Fund">Sinking Fund</SelectItem>
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

        <Button
          type="submit"
          size="sm"
          className="self-start"
          disabled={!form.watch('billType')}
        >
          Generate
        </Button>
      </form>
    </Form>
  );
}
