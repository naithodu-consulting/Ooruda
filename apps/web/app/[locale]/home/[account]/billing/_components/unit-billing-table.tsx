'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  X,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

import { ExportMenu } from '~/components/export-menu';
import {
  BILL_TYPE_FILTER_ITEMS,
  getDurationItems,
} from '~/lib/bill-filter-items';
import { getPeriodsForDuration } from '~/lib/bill-period-filter';
import { exportBillsCsv } from '~/lib/export-csv';
import { formatINR } from '~/lib/format-inr';

import type { BillRow } from '../_lib/billing-queries';
import {
  buildUnitTree,
  type UnitBill,
  type UnitDraftItem,
  type UnitNode,
  type UnitSummaryInput,
} from '../_lib/unit-billing-types';
import { UnitRow } from './unit-row';

interface Props {
  units: UnitSummaryInput[];
  bills: UnitBill[];
  /** Same bills, flattened with `unit_no` — used only for CSV/PDF export. */
  billRows: BillRow[];
  drafts: UnitDraftItem[];
  initialFilter?: string;
  initialType?: string;
  initialDuration?: string;
  accountSlug: string;
}

type StatusFilter = 'all' | 'outstanding' | 'overdue' | 'all_paid';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All Units' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'all_paid', label: 'All Paid' },
];

const PAGE_SIZE = 25;

const DURATION_ITEMS = getDurationItems();

function matchesFilter(node: UnitNode, filter: StatusFilter): boolean {
  switch (filter) {
    case 'outstanding':
      return node.outstanding > 0;
    case 'overdue':
      return node.overdue > 0;
    case 'all_paid':
      return node.status === 'all_paid';
    default:
      return true;
  }
}

/**
 * Level 1 of the billing drill-down: one row per unit.
 *
 * The row count always equals the unit count — an association with 30 units
 * shows 30 rows, every time, regardless of how many bills exist. Opening a unit
 * navigates to its own page rather than expanding in place, so this list never
 * needs per-bill detail.
 *
 * The charge-type and duration filters narrow the bill set *before* the tree is
 * built, so the Outstanding and Overdue columns always describe the same slice
 * the filters describe.
 */
export function UnitBillingTable({
  units,
  bills,
  billRows,
  drafts,
  initialFilter,
  initialType,
  initialDuration,
  accountSlug,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>(
    FILTERS.some((f) => f.key === initialFilter)
      ? (initialFilter as StatusFilter)
      : 'all',
  );
  const [typeFilter, setTypeFilter] = useState(
    initialType && initialType in BILL_TYPE_FILTER_ITEMS ? initialType : 'all',
  );
  const [duration, setDuration] = useState(
    initialDuration && initialDuration in DURATION_ITEMS
      ? initialDuration
      : 'all',
  );
  const [page, setPage] = useState(1);

  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(
    new Set(),
  );
  const [isExporting, setIsExporting] = useState(false);

  // Charge type and period narrow the bills themselves; the status pills and
  // search below narrow the resulting units.
  const periodsAllowed = useMemo(
    () => getPeriodsForDuration(duration),
    [duration],
  );

  const billMatches = useCallback(
    (b: { bill_type: string; period: string }) => {
      if (typeFilter !== 'all' && b.bill_type !== typeFilter) return false;
      if (periodsAllowed && !periodsAllowed.includes(b.period)) return false;
      return true;
    },
    [typeFilter, periodsAllowed],
  );

  const scopedBills = useMemo(
    () => bills.filter(billMatches),
    [bills, billMatches],
  );

  const isNarrowed = typeFilter !== 'all' || duration !== 'all';

  const tree = useMemo(() => {
    const full = buildUnitTree(units, scopedBills, drafts);
    // Unfiltered, every unit gets a row even with no bills — that is the point
    // of a unit-centric list. But once a charge type or period is chosen,
    // "Electricity" showing 25 units reading "No bills yet" is noise, so units
    // outside the chosen slice drop out.
    return isNarrowed ? full.filter((n) => n.billCount > 0) : full;
  }, [units, scopedBills, drafts, isNarrowed]);

  // Counts are computed over the whole tree, not the filtered view, so the
  // pills always show how many units each filter would actually reveal.
  const counts = useMemo(
    () => ({
      all: tree.length,
      outstanding: tree.filter((n) => n.outstanding > 0).length,
      overdue: tree.filter((n) => n.overdue > 0).length,
      all_paid: tree.filter((n) => n.status === 'all_paid').length,
    }),
    [tree],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tree.filter((node) => {
      if (!matchesFilter(node, filter)) return false;
      if (!q) return true;
      return (
        node.unit.unit_no.toLowerCase().includes(q) ||
        (node.unit.owner_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [tree, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Export acts on exactly what is on screen: the bills of every unit the
  // current filters leave visible, respecting both the charge-type/period
  // and the status pill filter so the download count always matches.
  const exportBills = useMemo(() => {
    const visible = new Set(filtered.map((n) => n.unit.id));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return billRows.filter((b) => {
      if (!visible.has(b.unit_id) || !billMatches(b)) return false;
      if (filter === 'outstanding')
        return b.status !== 'Paid' && b.status !== 'Reversed';
      if (filter === 'overdue')
        return (
          b.status !== 'Paid' &&
          b.status !== 'Reversed' &&
          new Date(b.due_date) < today
        );
      if (filter === 'all_paid')
        return b.status === 'Paid' || b.status === 'Reversed';
      return true;
    });
  }, [billRows, filtered, billMatches, filter]);

  const allOnPageSelected =
    paged.length > 0 && paged.every((n) => selectedUnitIds.has(n.unit.id));
  const someOnPageSelected = paged.some((n) => selectedUnitIds.has(n.unit.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someOnPageSelected && !allOnPageSelected;
    }
  }, [someOnPageSelected, allOnPageSelected]);

  // Any change to what's being shown sends you back to the first page —
  // staying on page 3 of a 1-page result set reads as an empty table.
  useEffect(() => {
    setPage(1);
  }, [search, filter, typeFilter, duration]);

  // Keep the view shareable without a Next.js navigation (which would refetch
  // and lose scroll). Only these three keys are touched — any other param on
  // the URL is left exactly as it was.
  useEffect(() => {
    const url = new URL(window.location.href);
    const sync = (key: string, value: string) => {
      if (value === 'all') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    };
    sync('filter', filter);
    sync('type', typeFilter);
    sync('duration', duration);
    window.history.replaceState(null, '', url.toString());
  }, [filter, typeFilter, duration]);

  const onToggleSelect = useCallback((unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      paged.forEach((n) => {
        if (allOnPageSelected) next.delete(n.unit.id);
        else next.add(n.unit.id);
      });
      return next;
    });
  };

  const handleZipExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/billing/bills/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitIds: [...selectedUnitIds], accountSlug }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Download failed. Please try again.');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] ?? 'bills.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilter =
    !!search || filter !== 'all' || typeFilter !== 'all' || duration !== 'all';

  const metrics = useMemo(
    () => ({
      units: filtered.length,
      billed: filtered.reduce((s, n) => s + n.billed, 0),
      outstanding: filtered.reduce((s, n) => s + n.outstanding, 0),
      overdueUnits: filtered.filter((n) => n.overdue > 0).length,
    }),
    [filtered],
  );

  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="border-b">
        {/* Row 1: filters + export */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <div className="relative min-w-[160px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unit no or owner…"
              aria-label="Search units"
              className="h-8 pr-8 pl-8 text-base"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* `items` is what lets Base UI's SelectValue render the label rather
              than the raw value — these filters have value ≠ label. */}
          <Select
            items={BILL_TYPE_FILTER_ITEMS}
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? 'all')}
          >
            <SelectTrigger
              className="bg-background h-8 w-[140px] text-sm"
              aria-label="Charge type"
              data-test="unit-billing-type-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BILL_TYPE_FILTER_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={DURATION_ITEMS}
            value={duration}
            onValueChange={(v) => setDuration(v ?? 'all')}
          >
            <SelectTrigger
              className="bg-background h-8 w-[150px] text-sm"
              aria-label="Period"
              data-test="unit-billing-duration-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DURATION_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-sm transition-colors',
                  filter === f.key
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'border-input text-muted-foreground hover:bg-muted',
                )}
              >
                {f.label}
                <span className="ml-1 opacity-60">({counts[f.key]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: live summary tiles + export actions */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2 sm:px-4">
            {[
              { label: 'Units', value: String(metrics.units) },
              { label: 'Billed', value: formatINR(metrics.billed) },
              {
                label: 'Outstanding',
                value: formatINR(metrics.outstanding),
                highlight: metrics.outstanding > 0,
              },
              {
                label: 'Overdue',
                value: String(metrics.overdueUnits),
                highlight: metrics.overdueUnits > 0,
              },
            ].map(({ label, value, highlight }) => (
              <div
                key={label}
                className="bg-muted/50 flex flex-col items-center rounded-md px-2.5 py-1.5 text-center"
              >
                <span
                  className={`text-base font-semibold tabular-nums ${highlight ? 'text-destructive' : 'text-foreground'}`}
                >
                  {value}
                </span>
                <span className="text-muted-foreground text-[13px] font-medium">
                  {label}
                </span>
              </div>
            ))}

            <div className="ml-auto flex items-center gap-2">
              {selectedUnitIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleZipExport}
                  disabled={isExporting}
                  className="h-8 gap-1.5 text-sm"
                >
                  {isExporting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Download PDFs ({selectedUnitIds.size})
                </Button>
              )}

              <ExportMenu
                ids={exportBills.map((b) => b.id)}
                count={exportBills.length}
                noun="bills"
                onCsvExport={() => exportBillsCsv(exportBills)}
                pdfEndpoint="/api/billing/bills/export/pdf"
                pdfFilename="bills.pdf"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Column headers + rows wrapped for horizontal scroll on mobile ─ */}
      <div className="overflow-x-auto">
        <div className="text-muted-foreground grid min-w-[640px] grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_110px_100px_100px_90px] items-center gap-2 border-b px-3 py-2 text-[13px] font-bold tracking-wider uppercase sm:grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_130px_110px_110px_100px] sm:px-4">
          <div className="flex items-center justify-center">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allOnPageSelected}
              onChange={handleSelectAll}
              aria-label="Select all units on this page"
              className="h-3.5 w-3.5 cursor-pointer rounded"
            />
          </div>
          <div />
          <div>Unit</div>
          <div>Owner</div>
          <div>Last Period</div>
          <div className="text-right">Outstanding</div>
          <div className="text-right">Overdue Bills</div>
          <div className="text-right">Status</div>
        </div>

        {paged.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-14">
            <p className="text-base font-semibold">No units match</p>
            <p className="text-muted-foreground text-sm">
              {search
                ? `Nothing found for "${search}".`
                : 'Try a different filter.'}
            </p>
            {hasActiveFilter && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-sm"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                  setTypeFilter('all');
                  setDuration('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          paged.map((node) => (
            <UnitRow
              key={node.unit.id}
              node={node}
              href={`/home/${accountSlug}/billing/units/${node.unit.id}`}
              selected={selectedUnitIds.has(node.unit.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm sm:px-4">
          <span className="text-muted-foreground">
            Showing {paged.length} of {filtered.length} unit
            {filtered.length !== 1 ? 's' : ''}
            {filtered.length !== tree.length && ` (${tree.length} total)`}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={safePage === 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-muted-foreground tabular-nums">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
