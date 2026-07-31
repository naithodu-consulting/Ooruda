'use client';

import { useState } from 'react';

import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Receipt,
  Wrench,
  Zap,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
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

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import type {
  PendingOtherCharge,
  PendingSinkingFundCharge,
} from '../_lib/billing-actions';

/** A utility invoice uploaded but not yet turned into per-unit bills. */
export interface PendingElectricityBill {
  id: string;
  period: string;
  invoice_amount: number;
  block_consumption_units: number;
  uploaded_at: string;
}

export interface PendingChargeWithUnit extends PendingOtherCharge {
  unit_no?: string | null;
  period: string;
}

export interface PendingSinkingChargeWithUnit extends PendingSinkingFundCharge {
  unit_no?: string | null;
  period: string;
}

const DRAFT_PAGE_SIZE = 20;

type DraftTypeFilter =
  | 'all'
  | 'maintenance'
  | 'electricity'
  | 'other_charges'
  | 'sinking_fund';

export function DraftBillsTab(props: {
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
  /** Renders next to filters — the sole primary CTA for the page. */
  generateBillsAction?: React.ReactNode;
  /** Renders in the Other Charges section header (or empty-state card). */
  otherChargesAction?: React.ReactNode;
  /** Renders in the Sinking Fund section header (or empty-state card). */
  sinkingFundAction?: React.ReactNode;
  /** Danger-zone action (super-admin only). */
  dangerZoneAction?: React.ReactNode;
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
      <p className="text-muted-foreground py-8 text-center text-base">
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

  const totalItems =
    (props.maintenancePending ? 1 : 0) +
    props.pendingElectricityBills.length +
    props.pendingCharges.length +
    props.pendingSinkingCharges.length;

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
    <div className="flex flex-col gap-4 pt-2">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-4">
        {[
          { label: 'Items pending', value: String(totalItems) },
          ...(props.maintenancePending
            ? [
                {
                  label: 'Maintenance',
                  value: formatPeriod(props.currentPeriod),
                },
              ]
            : []),
          ...(props.pendingElectricityBills.length > 0
            ? [
                {
                  label: 'Electricity',
                  value: `${props.pendingElectricityBills.length} month${props.pendingElectricityBills.length !== 1 ? 's' : ''} · ${formatINR(electricityTotal)}`,
                },
              ]
            : []),
          ...(props.pendingCharges.length > 0
            ? [
                {
                  label: 'Other Charges',
                  value: `${props.pendingCharges.length} charge${props.pendingCharges.length !== 1 ? 's' : ''} · ${formatINR(otherChargesTotal)}`,
                },
              ]
            : []),
          ...(props.pendingSinkingCharges.length > 0
            ? [
                {
                  label: 'Sinking Fund',
                  value: `${props.pendingSinkingCharges.length} charge${props.pendingSinkingCharges.length !== 1 ? 's' : ''} · ${formatINR(sinkingFundTotal)}`,
                },
              ]
            : []),
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-muted/50 flex flex-col items-center rounded-md px-3 py-1.5 text-center"
          >
            <span className="text-foreground text-base font-semibold tabular-nums">
              {value}
            </span>
            <span className="text-muted-foreground text-[13px] font-medium">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Filters + primary CTA */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
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
            <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
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

        {(props.generateBillsAction ?? props.dangerZoneAction) && (
          <div className="ml-auto flex items-center gap-2">
            {props.dangerZoneAction}
            {props.generateBillsAction}
          </div>
        )}
      </div>

      {!hasFilteredResults && (
        <p className="text-muted-foreground py-6 text-center text-base">
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
            <p className="text-muted-foreground px-1 text-base">
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
                    <TableCell className="text-muted-foreground text-right text-sm">
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

        {/* Pending Other Charges */}
        {filteredCharges.length > 0 ? (
          <DraftSection
            icon={<Receipt className="h-4 w-4" />}
            title="Other Charges"
            badge={`${filteredCharges.length} charge${filteredCharges.length !== 1 ? 's' : ''}`}
            total={filteredOtherChargesTotal}
            action={props.otherChargesAction}
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
                    <TableCell className="text-muted-foreground text-base">
                      {formatPeriod(pc.period)}
                    </TableCell>
                    <TableCell className="font-medium">{pc.label}</TableCell>
                    <TableCell className="text-base">
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
                <TableRow className="font-semibold">
                  <TableCell colSpan={3} className="text-base">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(filteredOtherChargesTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {totalChargesPages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-base">
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
        ) : props.otherChargesAction && typeFilter === 'all' ? (
          <DraftSection
            icon={<Receipt className="h-4 w-4" />}
            title="Other Charges"
            action={props.otherChargesAction}
          >
            <p className="text-muted-foreground px-1 text-base">
              No other charges staged yet.
            </p>
          </DraftSection>
        ) : null}

        {/* Pending Sinking Fund */}
        {filteredSinking.length > 0 ? (
          <DraftSection
            icon={<PiggyBank className="h-4 w-4" />}
            title="Sinking Fund"
            badge={`${filteredSinking.length} charge${filteredSinking.length !== 1 ? 's' : ''}`}
            total={filteredSinking.reduce((s, pc) => s + pc.amount, 0)}
            action={props.sinkingFundAction}
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
                    <TableCell className="text-muted-foreground text-base">
                      {formatPeriod(pc.period)}
                    </TableCell>
                    <TableCell className="font-medium">{pc.label}</TableCell>
                    <TableCell className="text-base">
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
                <TableRow className="font-semibold">
                  <TableCell colSpan={3} className="text-base">
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
        ) : props.sinkingFundAction && typeFilter === 'all' ? (
          <DraftSection
            icon={<PiggyBank className="h-4 w-4" />}
            title="Sinking Fund"
            action={props.sinkingFundAction}
          >
            <p className="text-muted-foreground px-1 text-base">
              No sinking fund charges staged yet.
            </p>
          </DraftSection>
        ) : null}
      </div>
    </div>
  );
}

function DraftSection(props: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  total?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{props.icon}</span>
        <span className="text-base font-semibold">{props.title}</span>
        {props.badge && (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[13px] font-medium">
            {props.badge}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {props.total != null && (
            <span className="text-foreground text-base font-bold tabular-nums">
              {formatINR(props.total)}
            </span>
          )}
          {props.action}
        </div>
      </div>
      <div className="overflow-x-auto">{props.children}</div>
    </div>
  );
}
