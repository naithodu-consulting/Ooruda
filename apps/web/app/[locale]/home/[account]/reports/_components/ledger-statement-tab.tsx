'use client';

import { useMemo } from 'react';

import { billTypeLabel } from '@kit/pdf-templates';
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

import { formatINR } from '~/lib/format-inr';

import type { StatementEntry } from '../../statement/_lib/statement-types';
import { LEDGER_ALL_UNITS, type UnitOption } from '../_lib/reports-types';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

export type LedgerView = 'all' | 'debit' | 'credit';

interface Props {
  rows: StatementEntry[];
  units: UnitOption[];
  selectedUnitId: string;
  onSelectedUnitChange: (unitId: string) => void;
  view: LedgerView;
  onViewChange: (v: LedgerView) => void;
}

const VIEW_OPTIONS: { value: LedgerView; label: string }[] = [
  { value: 'all', label: 'All Entries' },
  { value: 'debit', label: 'Debits' },
  { value: 'credit', label: 'Credits' },
];

/**
 * Effective credit contribution of an entry.
 *
 * Mirrors the running-balance rule in the statement service: a fully reversed
 * payment contributes nothing (the bill debit already carries the obligation),
 * and a partial refund is netted down by the refunded amount.
 */
function effectiveCredit(e: StatementEntry): number {
  if (e.direction !== 'credit') return 0;
  if (e.payment_status === 'reversed') return 0;
  if (e.payment_status === 'partial_refund' && e.refunded_amount) {
    return e.amount - e.refunded_amount;
  }
  return e.amount;
}

function formatEntryDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function entryLabel(e: StatementEntry): string {
  return e.charge_name ?? billTypeLabel(e.bill_type);
}

export function LedgerStatementTab({
  rows,
  units,
  selectedUnitId,
  onSelectedUnitChange,
  view,
  onViewChange,
}: Props) {
  // Totals and closing balance always reflect the full statement, never the
  // Debits/Credits view — a filtered subtotal masquerading as a balance would
  // be actively misleading.
  const { totalDebits, totalCredits, closingBalance } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const e of rows) {
      if (e.direction === 'debit') debits += e.amount;
      else credits += effectiveCredit(e);
    }
    // rows arrive newest-first, so the first entry carries the closing balance.
    return {
      totalDebits: debits,
      totalCredits: credits,
      closingBalance: rows[0]?.runningBalance ?? 0,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (view === 'all') return rows;
    return rows.filter((e) => e.direction === view);
  }, [rows, view]);

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, `${selectedUnitId}|${view}`);

  const isAllUnits = selectedUnitId === LEDGER_ALL_UNITS;
  const selectedUnit = units.find((u) => u.id === selectedUnitId);
  // Base UI's SelectValue renders the raw value unless given explicit children —
  // without this the trigger showed the unit's UUID instead of its number.
  const unitTriggerLabel = isAllUnits
    ? 'All Units'
    : (selectedUnit?.unit_no ?? '');

  return (
    <div className="flex flex-col gap-6">
      {/* Unit picker — primary scope selector for the statement */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Statement for</span>
        <Select
          value={selectedUnitId}
          onValueChange={(v) => onSelectedUnitChange(v as string)}
        >
          <SelectTrigger
            className="h-8 w-[180px]"
            data-test="ledger-statement-unit-select"
          >
            <SelectValue placeholder="Select a unit">
              {unitTriggerLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LEDGER_ALL_UNITS}>All Units</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.unit_no}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedUnitId ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            Select a unit to view its ledger statement.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile
              label="Total Debits"
              value={formatINR(totalDebits)}
              sub="Bills raised"
            />
            <KpiTile
              label="Total Credits"
              value={formatINR(totalCredits)}
              sub="Payments & advances"
              highlight="green"
            />
            <KpiTile
              label="Closing Balance"
              value={formatINR(Math.abs(closingBalance))}
              sub={
                closingBalance === 0
                  ? 'Settled'
                  : closingBalance > 0
                    ? 'In credit'
                    : 'Outstanding'
              }
              highlight={
                closingBalance === 0
                  ? undefined
                  : closingBalance > 0
                    ? 'green'
                    : 'red'
              }
            />
          </div>

          {/* Credit / Debit views */}
          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-test={`ledger-view-${opt.value}`}
                onClick={() => onViewChange(opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  view === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground hover:border-foreground/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Unit Account Statement
                {isAllUnits
                  ? ' - All Units'
                  : selectedUnit
                    ? ` - Unit ${selectedUnit.unit_no}`
                    : ''}
              </CardTitle>
              <CardDescription>
                {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
                {view !== 'all'
                  ? ` · ${view === 'debit' ? 'Debits' : 'Credits'} only`
                  : ''}
                {' · newest first'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      {isAllUnits && <TableHead>Unit</TableHead>}
                      <TableHead>Particulars</TableHead>
                      <TableHead>Bill No.</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      {/* A running balance only reads correctly when debits and
                          credits are interleaved in date order. */}
                      {view === 'all' && (
                        <TableHead className="text-right">Balance</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={
                            (view === 'all' ? 6 : 5) + (isAllUnits ? 1 : 0)
                          }
                          className="text-muted-foreground py-10 text-center text-sm"
                        >
                          No entries found for this unit.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paged.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {formatEntryDate(e.entry_date)}
                          </TableCell>
                          {isAllUnits && (
                            <TableCell className="font-medium">
                              {e.unit_no}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{entryLabel(e)}</span>
                              {e.payment_status === 'reversed' && (
                                <Badge
                                  variant="outline"
                                  className="border-[var(--color-danger)]/40 text-[var(--color-danger)]"
                                >
                                  Reversed
                                </Badge>
                              )}
                              {e.payment_status === 'partial_refund' && (
                                <Badge
                                  variant="outline"
                                  className="border-[var(--color-warning)]/40 text-[var(--color-warning)]"
                                >
                                  Partly refunded
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.bill_no ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {e.direction === 'debit' ? formatINR(e.amount) : ''}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {e.direction === 'credit'
                              ? formatINR(e.amount)
                              : ''}
                          </TableCell>
                          {view === 'all' && (
                            <TableCell
                              className={`text-right font-medium tabular-nums ${
                                e.runningBalance === 0
                                  ? ''
                                  : e.runningBalance > 0
                                    ? 'text-[var(--color-success)]'
                                    : 'text-[var(--color-danger)]'
                              }`}
                            >
                              {formatINR(Math.abs(e.runningBalance))}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                fromIndex={fromIndex}
                toIndex={toIndex}
                onPageChange={setPage}
                label="entries"
                testPrefix="ledger-statement"
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
