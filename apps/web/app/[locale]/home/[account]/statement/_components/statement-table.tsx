'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

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
  entry_type:
    | 'due'
    | 'advance_payment'
    | 'advance_applied'
    | 'due_payment'
    | 'reversal';
  bill_type: string;
  bill_no: string | null;
  /** Resolved charge name from bill line items (e.g. "Water Charges"). Overrides generic bill_type label. */
  charge_name: string | null;
  amount: number;
  direction: 'debit' | 'credit';
  entry_date: string;
  notes: string | null;
  mode: string | null;
  /** Set on due_payment entries affected by a Razorpay refund. */
  payment_status?: 'active' | 'reversed' | 'partial_refund';
  /** Amount already refunded (only set when payment_status='partial_refund'). */
  refunded_amount?: number;
  runningBalance: number;
}

interface Props {
  account: string;
  units: { id: string; unit_no: string }[];
  entries: StatementEntry[];
  initialFy?: string;
  initialType?: string;
  initialUnit?: string;
}

function TypeBadge({ entryType }: { entryType: StatementEntry['entry_type'] }) {
  switch (entryType) {
    case 'due':
      return (
        <span className="inline-flex shrink-0 items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
          Due
        </span>
      );
    case 'due_payment':
      return (
        <span className="inline-flex shrink-0 items-center rounded bg-green-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
          Payment
        </span>
      );
    case 'advance_payment':
      return (
        <span className="inline-flex shrink-0 items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
          Advance
        </span>
      );
    case 'advance_applied':
      return (
        <span className="inline-flex shrink-0 items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-purple-700 dark:bg-purple-500/10 dark:text-purple-400">
          Applied
        </span>
      );
    case 'reversal':
      return (
        <span className="inline-flex shrink-0 items-center rounded bg-orange-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
          Reversal
        </span>
      );
  }
}

function entryDescription(entry: StatementEntry): string {
  const bt = entry.charge_name ?? billTypeLabel(entry.bill_type);
  switch (entry.entry_type) {
    case 'due':
      return `${bt} bill raised`;
    case 'advance_payment':
      return `Advance deposited — ${bt}`;
    case 'advance_applied':
      return `Advance applied — ${bt}`;
    case 'due_payment':
      return `${bt} paid`;
    case 'reversal':
      return `${bt} payment reversed`;
  }
}

function entrySubtext(entry: StatementEntry): string | null {
  if (entry.entry_type === 'due_payment') {
    const modeLabel =
      entry.mode === 'Razorpay'
        ? 'via Razorpay'
        : entry.mode
          ? `via ${entry.mode}`
          : null;
    if (entry.bill_no && modeLabel)
      return `${entry.bill_no} · Paid ${modeLabel}`;
    if (entry.bill_no) return entry.bill_no;
    if (modeLabel) return `Paid ${modeLabel} · Applied to outstanding balance`;
    return entry.notes ?? 'Applied to outstanding balance';
  }
  if (entry.entry_type === 'reversal') {
    return entry.notes ?? 'Refunded by Razorpay';
  }
  if (entry.entry_type === 'due' && entry.bill_no) {
    return entry.bill_no;
  }
  return entry.notes;
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
  return { from: `${startYear}-04-01`, to: `${endYear}-03-31` };
}

function syncUrl(updates: Record<string, string | null>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  window.history.replaceState({}, '', url.toString());
}

export function StatementTable({
  account,
  units,
  entries,
  initialFy,
  initialType,
  initialUnit,
}: Props) {
  const defaultUnitId = units[0]?.id ?? '';
  const [activeUnitId, setActiveUnitId] = useState<string>(
    initialUnit ?? defaultUnitId,
  );
  const [billTypeFilter, setBillTypeFilter] = useState(
    initialType ?? BILL_TYPE_ALL,
  );
  const [fyFilter, setFyFilter] = useState(initialFy ?? currentFY());

  function handleUnitChange(id: string) {
    setActiveUnitId(id);
    syncUrl({ unit: id === defaultUnitId ? null : id });
  }
  function handleFyChange(fy: string | null) {
    if (!fy) return;
    setFyFilter(fy);
    syncUrl({ fy: fy === currentFY() ? null : fy });
  }
  function handleTypeChange(type: string | null) {
    if (!type) return;
    setBillTypeFilter(type);
    syncUrl({ type: type === BILL_TYPE_ALL ? null : type });
  }

  const billTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.bill_type);
    return Array.from(set).sort();
  }, [entries]);

  // Build filter option labels — for other_charges, surface actual charge names.
  const billTypeOptions = useMemo(() => {
    return billTypes.map((bt) => {
      if (bt === 'other_charges') {
        const names = [
          ...new Set(
            entries
              .filter(
                (e) =>
                  e.unit_id === activeUnitId &&
                  e.bill_type === bt &&
                  e.charge_name,
              )
              .map((e) => e.charge_name!),
          ),
        ];
        return {
          value: bt,
          label: names.length > 0 ? names.join(', ') : billTypeLabel(bt),
        };
      }
      return { value: bt, label: billTypeLabel(bt) };
    });
  }, [billTypes, entries, activeUnitId]);

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

  // Annotate FYs with transaction counts — hints at older history volumes.
  const fyWithCounts = useMemo(() => {
    return fiscalYears.map((fy) => {
      const range = fyRange(fy);
      const count = range
        ? entries.filter(
            (e) =>
              e.unit_id === activeUnitId &&
              e.entry_date >= range.from &&
              e.entry_date <= range.to,
          ).length
        : 0;
      return { fy, count };
    });
  }, [fiscalYears, entries, activeUnitId]);

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

  // Effective credit delta for an entry — used by opening balance and running balance.
  // Full reversals (payment_status='reversed') contribute 0: the bill debit already
  // represents the outstanding amount. Partial refunds contribute the net amount
  // (amount - refunded_amount) since the bill trigger has already adjusted paid_amount.
  function effectiveDelta(e: StatementEntry): number {
    if (e.direction === 'debit') return -e.amount;
    if (e.payment_status === 'reversed') return 0;
    if (e.payment_status === 'partial_refund' && e.refunded_amount)
      return e.amount - e.refunded_amount;
    return e.amount;
  }

  // Opening balance: sum of all entries for this unit BEFORE the filtered range.
  const openingBalance = useMemo(() => {
    const range = fyFilter !== FY_ALL ? fyRange(fyFilter) : null;
    if (!range) return null;
    return entries
      .filter(
        (e) =>
          e.unit_id === activeUnitId &&
          (billTypeFilter === BILL_TYPE_ALL ||
            e.bill_type === billTypeFilter) &&
          e.entry_date < range.from,
      )
      .reduce((sum, e) => sum + effectiveDelta(e), 0);
  }, [entries, activeUnitId, billTypeFilter, fyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute running balance on filtered slice (entries arrive newest-first).
  const rows = useMemo(() => {
    const asc = [...filtered].reverse();
    let bal = openingBalance ?? 0;
    const withBal = asc.map((e) => {
      bal += effectiveDelta(e);
      return { ...e, runningBalance: bal };
    });
    return withBal.reverse();
  }, [filtered, openingBalance]); // eslint-disable-line react-hooks/exhaustive-deps

  const closingBalance = rows[0]?.runningBalance ?? openingBalance ?? 0;

  const totalCredits = rows.reduce(
    (s, e) => s + (e.direction === 'credit' ? Math.max(0, effectiveDelta(e)) : 0),
    0,
  );
  const totalDebits = rows.reduce(
    (s, e) => s + (e.direction === 'debit' ? e.amount : 0),
    0,
  );

  const hasAdvances = rows.some(
    (e) =>
      e.entry_type === 'advance_payment' || e.entry_type === 'advance_applied',
  );
  const hasPayments = rows.some((e) => e.entry_type === 'due_payment');
  const creditsSubLabel =
    hasAdvances && hasPayments
      ? 'Advances & payments'
      : hasAdvances
        ? 'Advance deposits'
        : 'Payments received';

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

  const activePeriodLabel = fyFilter === FY_ALL ? 'All time' : `FY ${fyFilter}`;

  const activeBillTypeLabel =
    billTypeFilter === BILL_TYPE_ALL
      ? 'All types'
      : (billTypeOptions.find((o) => o.value === billTypeFilter)?.label ??
        billTypeLabel(billTypeFilter));

  return (
    <div className="flex flex-col gap-6">
      {/* Unit tabs */}
      {units.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => handleUnitChange(u.id)}
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

      {/* Summary cards — closing balance dominates (full-width on mobile) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Closing balance — full-width on mobile, accent border by state */}
        <Card
          className={`col-span-2 sm:col-span-1 ${
            closingBalance < 0
              ? 'border-l-destructive border-l-4'
              : closingBalance > 0
                ? 'border-l-4 border-l-green-500'
                : 'border-border'
          }`}
        >
          <CardContent className="px-4 py-5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Closing balance
            </p>
            <p
              className={`mt-1.5 text-3xl font-bold tabular-nums ${closingBalanceColor}`}
            >
              {closingBalance > 0 ? '+' : ''}
              {formatINR(Math.abs(closingBalance))}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className={`text-sm font-medium ${closingBalanceColor}`}>
                {closingBalanceSub}
              </p>
              {closingBalance < 0 && (
                <Link
                  href={`/home/${account}/payments`}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
                >
                  Pay now <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Total credits */}
        <Card className="border-border">
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Total credits
            </p>
            <p className="mt-1 text-2xl font-bold text-green-600 tabular-nums dark:text-green-400">
              {formatINR(totalCredits)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {creditsSubLabel}
            </p>
          </CardContent>
        </Card>

        {/* Total debits */}
        <Card className="border-border">
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Total debits
            </p>
            <p className="text-destructive mt-1 text-2xl font-bold tabular-nums">
              {formatINR(totalDebits)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Bills raised this period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Transaction history</CardTitle>
              <CardDescription>
                {activePeriodLabel} · {rows.length} transaction
                {rows.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={fyFilter} onValueChange={handleFyChange}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue>{activePeriodLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FY_ALL}>All time</SelectItem>
                  {fyWithCounts.map(({ fy, count }) => (
                    <SelectItem key={fy} value={fy}>
                      FY {fy}
                      {count > 0 && fy !== currentFY() ? ` · ${count}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={billTypeFilter} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-8 max-w-[160px] text-xs">
                  <SelectValue className="truncate">
                    {activeBillTypeLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BILL_TYPE_ALL}>All types</SelectItem>
                  {billTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
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
              No transactions for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Description</TableHead>
                    <TableHead className="text-right whitespace-nowrap">
                      Debit
                    </TableHead>
                    <TableHead className="text-right whitespace-nowrap">
                      Credit
                    </TableHead>
                    <TableHead className="pr-4 text-right whitespace-nowrap">
                      Balance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showOpeningRow && (
                    <TableRow className="bg-muted/30">
                      <TableCell className="text-muted-foreground py-2 pl-4 text-sm italic">
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
                  {rows.map((e, i) => {
                    const subtext = entrySubtext(e);
                    const isNewDate =
                      i === 0 || rows[i - 1]!.entry_date !== e.entry_date;
                    const dateLabel = new Date(e.entry_date).toLocaleDateString(
                      'en-IN',
                      { day: 'numeric', month: 'short', year: 'numeric' },
                    );
                    return (
                      <>
                        {isNewDate && (
                          <TableRow
                            key={`date-${e.entry_date}-${i}`}
                            className="bg-muted/40 hover:bg-muted/40"
                          >
                            <TableCell
                              colSpan={4}
                              className="text-muted-foreground py-1.5 pl-4 text-xs font-semibold tracking-wide"
                            >
                              {dateLabel}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow key={e.id}>
                          <TableCell className="py-3 pl-4">
                            <div className="flex items-start gap-2">
                              <TypeBadge entryType={e.entry_type} />
                              <div className="min-w-0">
                                <span
                                  className={`text-foreground block text-sm font-medium ${
                                    e.payment_status === 'reversed'
                                      ? 'line-through opacity-50'
                                      : ''
                                  }`}
                                >
                                  {entryDescription(e)}
                                </span>
                                {e.payment_status === 'reversed' && (
                                  <span className="border-destructive/30 bg-destructive/10 text-destructive inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                                    Reversed
                                  </span>
                                )}
                                {e.payment_status === 'partial_refund' && e.refunded_amount && (
                                  <span className="inline-flex items-center rounded-full border border-orange-300/50 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400">
                                    Partial refund · {formatINR(e.refunded_amount)}
                                  </span>
                                )}
                                {subtext && (
                                  <span className="text-muted-foreground/60 mt-0.5 block text-[11px]">
                                    {subtext}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-destructive py-3 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
                            {e.direction === 'debit' ? formatINR(e.amount) : ''}
                          </TableCell>
                          <TableCell className="py-3 text-right text-sm font-semibold whitespace-nowrap text-green-600 tabular-nums dark:text-green-400">
                            {e.direction === 'credit'
                              ? formatINR(e.amount)
                              : ''}
                          </TableCell>
                          <TableCell
                            className={`py-3 pr-4 text-right text-sm font-bold whitespace-nowrap tabular-nums ${
                              e.runningBalance >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-destructive'
                            }`}
                          >
                            {e.runningBalance >= 0 ? '+' : ''}
                            {formatINR(Math.abs(e.runningBalance))}
                          </TableCell>
                        </TableRow>
                      </>
                    );
                  })}
                  {/* Period totals footer row */}
                  <TableRow className="bg-muted/20 hover:bg-muted/20 border-t-2">
                    <TableCell className="text-muted-foreground py-3 pl-4 text-xs font-semibold tracking-wide uppercase">
                      Period totals
                    </TableCell>
                    <TableCell className="text-destructive py-3 text-right text-sm font-bold whitespace-nowrap tabular-nums">
                      {formatINR(totalDebits)}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm font-bold whitespace-nowrap text-green-600 tabular-nums dark:text-green-400">
                      {formatINR(totalCredits)}
                    </TableCell>
                    <TableCell
                      className={`py-3 pr-4 text-right text-sm font-bold whitespace-nowrap tabular-nums ${closingBalanceColor}`}
                    >
                      {closingBalance >= 0 ? '+' : ''}
                      {formatINR(Math.abs(closingBalance))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
