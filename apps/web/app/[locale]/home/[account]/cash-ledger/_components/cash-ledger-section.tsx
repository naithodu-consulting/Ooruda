'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Plus, Upload } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
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
];

const ENTRY_TYPE_LABELS: Record<string, string> = {
  due: 'Due',
  advance_payment: 'Advance Payment',
  advance_applied: 'Advance Applied',
  due_payment: 'Due Payment',
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
}

interface Props {
  associationId: string;
  units: { id: string; unit_no: string }[];
  canManage: boolean;
  canDelete: boolean;
  isRestricted: boolean;
}

export function CashLedgerSection({
  associationId,
  units,
  canManage,
  isRestricted,
}: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    units[0]?.id ?? '',
  );
  const [selectedBillType, setSelectedBillType] = useState('all');
  const [entries, setEntries] = useState<CashLedgerEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!selectedUnitId) return;
    setLoading(true);
    const result = await getCashLedgerEntriesAction(
      associationId,
      selectedUnitId,
      selectedBillType,
    );
    if (result.success && result.entries) {
      setEntries(result.entries);
    }
    setLoading(false);
  }, [associationId, selectedUnitId, selectedBillType]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const runningEntries = useMemo<RunningEntry[]>(() => {
    let balance = 0;
    return entries.map((e) => {
      balance += e.direction === 'credit' ? e.amount : -e.amount;
      return { ...e, runningBalance: balance };
    });
  }, [entries]);

  const netBalance = runningEntries.at(-1)?.runningBalance ?? 0;

  const selectedUnit = units.find((u) => u.id === selectedUnitId);
  const selectedBillTypeLabel =
    BILL_TYPE_OPTIONS.find((o) => o.value === selectedBillType)?.label ??
    'All Types';

  return (
    <div className="space-y-5">
      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {!isRestricted && (
          <Select
            value={selectedUnitId}
            onValueChange={(v) => setSelectedUnitId(v ?? '')}
          >
            <SelectTrigger className="w-36 text-sm">
              <span className="truncate">
                {selectedUnit ? `Unit ${selectedUnit.unit_no}` : 'Select unit'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  Unit {u.unit_no}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={selectedBillType}
          onValueChange={(v) => setSelectedBillType(v ?? 'all')}
        >
          <SelectTrigger className="w-40 text-sm">
            <span className="truncate">{selectedBillTypeLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {BILL_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManage && (
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Entry
            </Button>
          </div>
        )}
      </div>

      {/* Balance summary chip */}
      <BalanceChip balance={netBalance} loading={loading} />

      {/* Running balance table */}
      <Card>
        <CardHeader className="pt-4 pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">
            {selectedUnit ? `Unit ${selectedUnit.unit_no}` : 'Ledger'} — Running
            Balance
            {entries.length > 0 && (
              <span className="ml-2 font-normal">
                ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-36">Type</TableHead>
                  <TableHead className="w-32">Bill Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-28 text-right">Debit</TableHead>
                  <TableHead className="w-28 text-right">Credit</TableHead>
                  <TableHead className="w-32 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground py-10 text-center text-sm"
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : runningEntries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground py-10 text-center text-sm"
                    >
                      No ledger entries yet for this unit.
                    </TableCell>
                  </TableRow>
                ) : (
                  runningEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm whitespace-nowrap tabular-nums">
                        {formatEntryDate(e.entry_date)}
                      </TableCell>
                      <TableCell>
                        <EntryTypeBadge type={e.entry_type} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {BILL_TYPE_OPTIONS.find((o) => o.value === e.bill_type)
                          ?.label ?? e.bill_type}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-48 truncate text-sm">
                        {e.notes ?? e.paid_by_name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {e.direction === 'debit' ? formatINR(e.amount) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {e.direction === 'credit' ? formatINR(e.amount) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        <BalanceCell value={e.runningBalance} />
                      </TableCell>
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
            defaultUnitId={selectedUnitId}
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

function BalanceChip({
  balance,
  loading,
}: {
  balance: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-muted/30 inline-flex flex-col rounded-lg border px-4 py-2.5">
        <span className="text-muted-foreground text-xs">Net Balance</span>
        <span className="bg-muted mt-0.5 h-6 w-20 animate-pulse rounded" />
      </div>
    );
  }

  if (balance > 0) {
    return (
      <div className="inline-flex flex-col rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 dark:border-green-800 dark:bg-green-950/40">
        <span className="text-xs font-medium text-green-700 dark:text-green-400">
          Advance Balance
        </span>
        <span className="mt-0.5 font-mono text-lg font-semibold tracking-tight text-green-700 dark:text-green-300">
          {formatINR(balance)}
          <span className="ml-1 text-xs font-normal opacity-70">CR</span>
        </span>
      </div>
    );
  }

  if (balance < 0) {
    return (
      <div className="inline-flex flex-col rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-800 dark:bg-red-950/40">
        <span className="text-xs font-medium text-red-700 dark:text-red-400">
          Outstanding Dues
        </span>
        <span className="mt-0.5 font-mono text-lg font-semibold tracking-tight text-red-700 dark:text-red-300">
          {formatINR(Math.abs(balance))}
          <span className="ml-1 text-xs font-normal opacity-70">DR</span>
        </span>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col rounded-lg border px-4 py-2.5">
      <span className="text-muted-foreground text-xs">Net Balance</span>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-muted-foreground font-mono text-lg font-semibold tracking-tight">
          {formatINR(0)}
        </span>
        <span className="text-muted-foreground text-xs">Settled</span>
      </div>
    </div>
  );
}

function BalanceCell({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="font-medium text-green-600 dark:text-green-400">
        {formatINR(value)}
        <span className="ml-1 text-[10px] opacity-70">CR</span>
      </span>
    );
  if (value < 0)
    return (
      <span className="font-medium text-red-600 dark:text-red-400">
        {formatINR(Math.abs(value))}
        <span className="ml-1 text-[10px] opacity-70">DR</span>
      </span>
    );
  return <span className="text-muted-foreground">—</span>;
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
