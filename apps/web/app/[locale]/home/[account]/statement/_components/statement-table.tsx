'use client';

import { useMemo, useState } from 'react';

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

import { billTypeLabel } from '~/lib/bill-type-labels';
import { formatINR } from '~/lib/format-inr';

export interface StatementEntry {
  id: string;
  unit_id: string;
  unit_no: string;
  entry_type: 'due' | 'advance_payment' | 'advance_applied' | 'due_payment';
  bill_type: string;
  amount: number;
  direction: 'debit' | 'credit';
  paid_by_name: string;
  entry_date: string;
  notes: string | null;
  created_at: string;
  runningBalance: number;
}

interface Props {
  units: { id: string; unit_no: string }[];
  entries: StatementEntry[];
}

/** Clean notes for display — strip raw Razorpay ref if present. */
function cleanNotes(entry: StatementEntry): string | null {
  const { notes, entry_type } = entry;
  if (!notes) return null;
  if (entry_type === 'due_payment') {
    if (notes.includes('Razorpay')) return 'Paid via Razorpay';
    return notes;
  }
  return notes;
}

function entryDescription(entry: StatementEntry): string {
  const bt = billTypeLabel(entry.bill_type);
  switch (entry.entry_type) {
    case 'due':
      return `${bt} due raised`;
    case 'advance_payment':
      return `Advance deposited - ${bt}`;
    case 'advance_applied':
      return `Advance applied - ${bt}`;
    case 'due_payment':
      return `Due payment for ${bt}`;
  }
}

const BILL_TYPE_ALL = '__all__';
const FY_ALL = '__all__';

function currentFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

function fyRange(fy: string): { from: string; to: string } | null {
  const match = fy.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const startYear = parseInt(match[1]!);
  const endYear = startYear + 1;
  return {
    from: `${startYear}-04-01`,
    to: `${endYear}-03-31`,
  };
}

export function StatementTable({ units, entries }: Props) {
  const [activeUnitId, setActiveUnitId] = useState<string>(
    units[0]?.id ?? '',
  );
  const [billTypeFilter, setBillTypeFilter] = useState(BILL_TYPE_ALL);
  const [fyFilter, setFyFilter] = useState(currentFY());

  const billTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.bill_type);
    return Array.from(set).sort();
  }, [entries]);

  const fiscalYears = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const d = new Date(e.entry_date);
      const m = d.getMonth();
      const y = d.getFullYear();
      const fyStart = m >= 3 ? y : y - 1;
      set.add(`${fyStart}-${String(fyStart + 1).slice(2)}`);
    }
    return Array.from(set).sort().reverse();
  }, [entries]);

  const filtered = useMemo(() => {
    const range = fyFilter !== FY_ALL ? fyRange(fyFilter) : null;
    return entries.filter((e) => {
      if (e.unit_id !== activeUnitId) return false;
      if (billTypeFilter !== BILL_TYPE_ALL && e.bill_type !== billTypeFilter)
        return false;
      if (range) {
        if (e.entry_date < range.from || e.entry_date > range.to) return false;
      }
      return true;
    });
  }, [entries, activeUnitId, billTypeFilter, fyFilter]);

  // Opening balance: sum of all entries for this unit BEFORE the filtered range.
  const openingBalance = useMemo(() => {
    const range = fyFilter !== FY_ALL ? fyRange(fyFilter) : null;
    if (!range) return null;
    return entries
      .filter(
        (e) =>
          e.unit_id === activeUnitId &&
          (billTypeFilter === BILL_TYPE_ALL || e.bill_type === billTypeFilter) &&
          e.entry_date < range.from,
      )
      .reduce(
        (sum, e) => sum + (e.direction === 'credit' ? e.amount : -e.amount),
        0,
      );
  }, [entries, activeUnitId, billTypeFilter, fyFilter]);

  // Recompute running balance on filtered + sorted slice (entries come in newest-first).
  const rows = useMemo(() => {
    const asc = [...filtered].reverse();
    let bal = openingBalance ?? 0;
    const withBal = asc.map((e) => {
      bal += e.direction === 'credit' ? e.amount : -e.amount;
      return { ...e, runningBalance: bal };
    });
    return withBal.reverse();
  }, [filtered, openingBalance]);

  const closingBalance = rows[0]?.runningBalance ?? (openingBalance ?? 0);

  const totalCredits = rows.reduce(
    (s, e) => s + (e.direction === 'credit' ? e.amount : 0),
    0,
  );
  const totalDebits = rows.reduce(
    (s, e) => s + (e.direction === 'debit' ? e.amount : 0),
    0,
  );

  const showOpeningRow = openingBalance !== null && openingBalance !== 0;

  const closingBalanceColor =
    closingBalance === 0
      ? 'text-muted-foreground'
      : closingBalance > 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-destructive';

  const closingBalanceSub =
    closingBalance === 0
      ? 'All settled'
      : closingBalance > 0
        ? 'Credit available'
        : 'Amount due';

  return (
    <div className="flex flex-col gap-6">
      {/* Unit tabs */}
      {units.length > 1 && (
        <div className="flex gap-2">
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

      {/* Summary card */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="border-border">
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Closing balance
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${closingBalanceColor}`}>
              {closingBalance > 0 ? '+' : ''}
              {formatINR(Math.abs(closingBalance))}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {closingBalanceSub}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Total credits
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              {formatINR(totalCredits)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Advances &amp; payments
            </p>
          </CardContent>
        </Card>

        <Card className="border-border col-span-2 sm:col-span-1">
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Total debits
            </p>
            <p className="text-destructive mt-1 text-2xl font-bold tabular-nums">
              {formatINR(totalDebits)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Dues &amp; applied advances
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Ledger activity</CardTitle>
              <CardDescription>
                {rows.length} transaction{rows.length !== 1 ? 's' : ''} — advances, dues, and payments
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={fyFilter} onValueChange={(v) => v && setFyFilter(v)}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue>
                    {fyFilter === FY_ALL ? 'All time' : `FY ${fyFilter}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FY_ALL}>All time</SelectItem>
                  {fiscalYears.map((fy) => (
                    <SelectItem key={fy} value={fy}>
                      FY {fy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={billTypeFilter} onValueChange={(v) => v && setBillTypeFilter(v)}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue>
                    {billTypeFilter === BILL_TYPE_ALL
                      ? 'All types'
                      : billTypeLabel(billTypeFilter)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BILL_TYPE_ALL}>All types</SelectItem>
                  {billTypes.map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {billTypeLabel(bt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No ledger activity for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="pr-4 text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showOpeningRow && (
                    <TableRow className="bg-muted/30">
                      <TableCell className="text-muted-foreground py-2 pl-4 text-sm">
                        —
                      </TableCell>
                      <TableCell className="text-muted-foreground py-2 text-sm italic">
                        Opening balance
                      </TableCell>
                      <TableCell className="py-2 text-right" />
                      <TableCell className="py-2 text-right" />
                      <TableCell
                        className={`py-2 pr-4 text-right text-sm font-semibold tabular-nums ${
                          openingBalance! >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-destructive'
                        }`}
                      >
                        {openingBalance! >= 0 ? '+' : ''}
                        {formatINR(Math.abs(openingBalance!))}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((e) => {
                    const displayNotes = cleanNotes(e);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-muted-foreground py-3 pl-4 text-sm">
                          {new Date(e.entry_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-foreground block text-sm font-medium">
                            {entryDescription(e)}
                          </span>
                          {displayNotes && (
                            <span className="text-muted-foreground block text-xs">
                              {displayNotes}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-destructive py-3 text-right text-sm font-semibold tabular-nums">
                          {e.direction === 'debit' ? formatINR(e.amount) : ''}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                          {e.direction === 'credit' ? formatINR(e.amount) : ''}
                        </TableCell>
                        <TableCell
                          className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${
                            e.runningBalance >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-destructive'
                          }`}
                        >
                          {e.runningBalance >= 0 ? '+' : ''}
                          {formatINR(Math.abs(e.runningBalance))}
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
