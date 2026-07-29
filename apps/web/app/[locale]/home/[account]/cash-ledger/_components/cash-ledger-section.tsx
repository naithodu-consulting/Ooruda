'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CheckCircle2, Plus, Upload } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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

import { formatINR } from '~/lib/format-inr';

import {
  getCashLedgerEntriesAction,
  type CashLedgerEntryRow,
} from '../_lib/cash-ledger-actions';
import { AddCashLedgerEntryDialog } from './add-cash-ledger-entry-dialog';
import { ImportCashLedgerDialog } from './import-cash-ledger-dialog';

const BILL_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'other_charges', label: 'Other Charges' },
  { value: 'sinking_fund', label: 'Sinking Fund' },
];

const ENTRY_TYPE_LABELS: Record<string, string> = {
  due: 'Due',
  advance_payment: 'Advance',
  advance_applied: 'Advance Applied',
  due_payment: 'Payment',
};

function formatEntryDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface RunningEntry extends CashLedgerEntryRow {
  runningBalance: number;
  unit_no?: string;
}

interface Props {
  associationId: string;
  units: { id: string; unit_no: string }[];
  canManage: boolean;
  canDelete: boolean;
  initialEntries?: CashLedgerEntryRow[];
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

export function CashLedgerSection({
  associationId,
  units,
  canManage,
  initialEntries,
  defaultDateFrom = '',
  defaultDateTo = '',
}: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all');
  const [selectedBillType, setSelectedBillType] = useState('all');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [entries, setEntries] = useState<CashLedgerEntryRow[]>(
    initialEntries ?? [],
  );
  const [loading, setLoading] = useState(false);
  // Stable record of what the server already fetched — never mutated so it
  // stays valid across React StrictMode's double-effect invocations.
  const serverFiltersRef = useRef(
    initialEntries
      ? {
          unitId: 'all',
          billType: 'all',
          dateFrom: defaultDateFrom,
          dateTo: defaultDateTo,
        }
      : null,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const unitMap = useMemo(
    () => new Map(units.map((u) => [u.id, u.unit_no])),
    [units],
  );

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const result = await getCashLedgerEntriesAction(
      associationId,
      selectedUnitId,
      selectedBillType,
      dateFrom || undefined,
      dateTo || undefined,
    );
    if (result.success && result.entries) {
      setEntries(result.entries);
    }
    setLoading(false);
  }, [associationId, selectedUnitId, selectedBillType, dateFrom, dateTo]);

  useEffect(() => {
    // If the server already fetched data for the current filter state, skip.
    // Using a stable ref (never mutated) makes this safe under StrictMode's
    // double-effect invocation — the second run sees the same ref and also skips.
    const sf = serverFiltersRef.current;
    if (
      sf &&
      sf.unitId === selectedUnitId &&
      sf.billType === selectedBillType &&
      sf.dateFrom === dateFrom &&
      sf.dateTo === dateTo
    ) {
      return;
    }
    void fetchEntries();
  }, [fetchEntries, selectedUnitId, selectedBillType, dateFrom, dateTo]);

  const isAllUnits = selectedUnitId === 'all';

  const runningEntries = useMemo<RunningEntry[]>(() => {
    if (isAllUnits) {
      return entries.map((e) => ({
        ...e,
        unit_no: unitMap.get(e.unit_id) ?? e.unit_id,
        runningBalance: 0,
      }));
    }
    let balance = 0;
    return entries.map((e) => {
      balance += e.direction === 'credit' ? e.amount : -e.amount;
      return { ...e, runningBalance: balance };
    });
  }, [entries, isAllUnits, unitMap]);

  const netBalance = isAllUnits
    ? null
    : (runningEntries.at(-1)?.runningBalance ?? 0);

  const allUnitsSummary = useMemo(() => {
    if (!isAllUnits) return null;
    const perUnit = new Map<string, number>();
    for (const e of entries) {
      const prev = perUnit.get(e.unit_id) ?? 0;
      perUnit.set(
        e.unit_id,
        prev + (e.direction === 'credit' ? e.amount : -e.amount),
      );
    }
    let advanceUnits = 0,
      advanceTotal = 0,
      dueUnits = 0,
      dueTotal = 0;
    for (const [, bal] of perUnit) {
      if (bal > 0) {
        advanceUnits++;
        advanceTotal += bal;
      } else if (bal < 0) {
        dueUnits++;
        dueTotal += Math.abs(bal);
      }
    }
    return { advanceUnits, advanceTotal, dueUnits, dueTotal };
  }, [entries, isAllUnits]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId);
  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="bg-muted/40 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border px-4 py-3">
        <FilterField label="Unit">
          <Select
            value={selectedUnitId}
            onValueChange={(v) => setSelectedUnitId(v ?? 'all')}
          >
            <SelectTrigger className="h-9 w-full text-sm sm:w-36">
              <span className="truncate">
                {isAllUnits
                  ? 'All Units'
                  : selectedUnit
                    ? selectedUnit.unit_no
                    : 'Select unit'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.unit_no}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Bill Type">
          <Select
            value={selectedBillType}
            onValueChange={(v) => setSelectedBillType(v ?? 'all')}
          >
            <SelectTrigger className="h-9 w-full text-sm sm:w-40">
              <span className="truncate">
                {BILL_TYPE_OPTIONS.find((o) => o.value === selectedBillType)
                  ?.label ?? 'All Types'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {BILL_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {/* Date range — wraps on narrow screens */}
        <div className="flex flex-wrap items-end gap-2">
          <FilterField label="From">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-36 text-sm"
            />
          </FilterField>
          <FilterField label="To">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-36 text-sm"
            />
          </FilterField>
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 self-end px-2 text-xs"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Actions — full-width row on mobile */}
        {canManage && (
          <div className="flex w-full shrink-0 gap-2 sm:ml-auto sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 sm:flex-none"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import CSV
            </Button>
            <Button
              size="sm"
              className="h-9 flex-1 sm:flex-none"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Entry
            </Button>
          </div>
        )}
      </div>

      {/* ── Summary strip ── */}
      {!loading &&
        (isAllUnits ? (
          <AllUnitsSummary summary={allUnitsSummary} />
        ) : (
          <SingleUnitBalance balance={netBalance ?? 0} />
        ))}

      {/* ── Ledger table ── */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b px-5 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {isAllUnits
                ? 'All Units'
                : selectedUnit
                  ? selectedUnit.unit_no
                  : 'Ledger'}
            </CardTitle>
            {!loading && entries.length > 0 && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  {isAllUnits && (
                    <TableHead className="w-20 pl-5 text-xs font-semibold tracking-wide uppercase">
                      Unit
                    </TableHead>
                  )}
                  <TableHead
                    className={cn(
                      'w-32 text-xs font-semibold tracking-wide uppercase',
                      !isAllUnits && 'pl-5',
                    )}
                  >
                    Date
                  </TableHead>
                  <TableHead className="w-36 text-xs font-semibold tracking-wide uppercase">
                    Type
                  </TableHead>
                  <TableHead className="w-36 text-xs font-semibold tracking-wide uppercase">
                    Bill Type
                  </TableHead>
                  <TableHead className="w-28 text-right text-xs font-semibold tracking-wide uppercase">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide uppercase">
                    Paid By
                  </TableHead>
                  <TableHead className="max-w-48 text-xs font-semibold tracking-wide uppercase">
                    Notes
                  </TableHead>
                  {!isAllUnits && (
                    <TableHead className="w-32 pr-5 text-right text-xs font-semibold tracking-wide uppercase">
                      Balance
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground py-16 text-center text-sm"
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : runningEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <p className="text-muted-foreground text-sm">
                        No entries match the selected filters.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  runningEntries.map((e) => (
                    <TableRow
                      key={e.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {isAllUnits && (
                        <TableCell className="pl-5 text-sm font-medium whitespace-nowrap">
                          {e.unit_no}
                        </TableCell>
                      )}
                      <TableCell
                        className={cn(
                          'text-muted-foreground text-sm whitespace-nowrap tabular-nums',
                          !isAllUnits && 'pl-5',
                        )}
                      >
                        {formatEntryDate(e.entry_date)}
                      </TableCell>
                      <TableCell>
                        <EntryTypeBadge type={e.entry_type} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {BILL_TYPE_OPTIONS.find((o) => o.value === e.bill_type)
                          ?.label ?? e.bill_type}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        <AmountCell amount={e.amount} direction={e.direction} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {e.paid_by_name || (
                          <span className="opacity-30">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-48 truncate text-sm">
                        {e.notes || <span className="opacity-30">—</span>}
                      </TableCell>
                      {!isAllUnits && (
                        <TableCell className="pr-5 text-right text-sm font-semibold tabular-nums">
                          <BalanceCell value={e.runningBalance} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <>
          <AddCashLedgerEntryDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            associationId={associationId}
            units={units}
            defaultUnitId={isAllUnits ? (units[0]?.id ?? '') : selectedUnitId}
            onSuccess={fetchEntries}
          />
          <ImportCashLedgerDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            associationId={associationId}
            onSuccess={fetchEntries}
          />
        </>
      )}
    </div>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ── Summary components ──────────────────────────────────────────────────────

function AllUnitsSummary({
  summary,
}: {
  summary: {
    advanceUnits: number;
    advanceTotal: number;
    dueUnits: number;
    dueTotal: number;
  } | null;
}) {
  if (!summary) return null;

  const hasAdvance = summary.advanceTotal > 0;
  const hasDues = summary.dueTotal > 0;

  if (!hasAdvance && !hasDues) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        All units are settled — no outstanding dues or advance balances.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {hasAdvance && (
        <SummaryCard
          label="Units in Advance"
          count={summary.advanceUnits}
          amount={summary.advanceTotal}
          suffix="CR"
          variant="credit"
        />
      )}
      {hasDues && (
        <SummaryCard
          label="Units with Dues"
          count={summary.dueUnits}
          amount={summary.dueTotal}
          suffix="DR"
          variant="debit"
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  amount,
  suffix,
  variant,
}: {
  label: string;
  count: number;
  amount: number;
  suffix: string;
  variant: 'credit' | 'debit';
}) {
  const isCredit = variant === 'credit';
  return (
    <div
      className={cn(
        'inline-flex flex-col rounded-xl border px-5 py-3',
        isCredit
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40'
          : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
      )}
    >
      <span
        className={cn(
          'text-[11px] font-semibold tracking-wide uppercase',
          isCredit
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400',
        )}
      >
        {label}
        {count > 0 && (
          <span className="ml-1.5 font-normal opacity-60">({count})</span>
        )}
      </span>
      <span
        className={cn(
          'mt-1 text-xl font-bold tracking-tight tabular-nums',
          isCredit
            ? 'text-green-700 dark:text-green-300'
            : 'text-red-700 dark:text-red-300',
        )}
      >
        {formatINR(amount)}
        <span
          className={cn(
            'ml-1.5 text-[11px] font-semibold tracking-wide opacity-60',
          )}
        >
          {suffix}
        </span>
      </span>
    </div>
  );
}

function SingleUnitBalance({ balance }: { balance: number }) {
  if (balance > 0) {
    return (
      <SummaryCard
        label="Advance Balance"
        count={0}
        amount={balance}
        suffix="CR"
        variant="credit"
      />
    );
  }
  if (balance < 0) {
    return (
      <SummaryCard
        label="Outstanding Dues"
        count={0}
        amount={Math.abs(balance)}
        suffix="DR"
        variant="debit"
      />
    );
  }
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-green-500" />
      Fully settled — no outstanding balance.
    </div>
  );
}

// ── Table cell components ───────────────────────────────────────────────────

function AmountCell({
  amount,
  direction,
}: {
  amount: number;
  direction: string;
}) {
  if (direction === 'credit') {
    return (
      <span className="font-semibold text-green-600 dark:text-green-400">
        {formatINR(amount)}
      </span>
    );
  }
  return (
    <span className="font-semibold text-red-600 dark:text-red-400">
      {formatINR(amount)}
    </span>
  );
}

function BalanceCell({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="font-semibold text-green-600 dark:text-green-400">
        {formatINR(value)}{' '}
        <span className="text-[10px] font-normal opacity-50">CR</span>
      </span>
    );
  if (value < 0)
    return (
      <span className="font-semibold text-red-600 dark:text-red-400">
        {formatINR(Math.abs(value))}{' '}
        <span className="text-[10px] font-normal opacity-50">DR</span>
      </span>
    );
  return <span className="text-muted-foreground text-xs">Settled</span>;
}

function EntryTypeBadge({ type }: { type: string }) {
  const label = ENTRY_TYPE_LABELS[type] ?? type;
  const cls = cn(
    'text-xs font-medium',
    type === 'due' &&
      'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    type === 'advance_payment' &&
      'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    type === 'advance_applied' &&
      'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    type === 'due_payment' &&
      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  );
  return <Badge className={cls}>{label}</Badge>;
}
