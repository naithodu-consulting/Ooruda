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
import { cn } from '@kit/ui/utils';

import {
  buildUnitTree,
  type BillDetail,
  type UnitBill,
  type UnitDraftItem,
  type UnitNode,
  type UnitSummaryInput,
} from '../_lib/unit-billing-types';
import { UnitRow } from './unit-row';

interface Props {
  units: UnitSummaryInput[];
  bills: UnitBill[];
  drafts: UnitDraftItem[];
  /** Deep-link target from ?unit= — auto-expands that unit on mount. */
  initialUnitNo?: string;
  initialFilter?: string;
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
 * The unit-centric billing table.
 *
 * The row count always equals the unit count — an association with 30 units
 * shows 30 rows, every time, regardless of how many bills exist. Detail unfolds
 * in place: unit → period → bill type → line items & payments.
 *
 * The unit/period/type tree is built entirely from data the server already
 * sent, so expanding and collapsing never hits the network. Only the innermost
 * level (line items + payment history) is fetched on demand.
 */
export function UnitBillingTable({
  units,
  bills,
  drafts,
  initialUnitNo,
  initialFilter,
  accountSlug,
}: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>(
    FILTERS.some((f) => f.key === initialFilter)
      ? (initialFilter as StatusFilter)
      : 'all',
  );
  const [page, setPage] = useState(1);

  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(
    new Set(),
  );
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const [detailCache, setDetailCache] = useState<Map<string, BillDetail>>(
    new Map(),
  );

  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(
    new Set(),
  );
  const [isExporting, setIsExporting] = useState(false);

  const tree = useMemo(
    () => buildUnitTree(units, bills, drafts),
    [units, bills, drafts],
  );

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

  // Selection derived state
  const allOnPageSelected =
    paged.length > 0 && paged.every((n) => selectedUnitIds.has(n.unit.id));
  const someOnPageSelected = paged.some((n) => selectedUnitIds.has(n.unit.id));

  // Sync indeterminate state on the select-all checkbox
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
  }, [search, filter]);

  // Deep link: ?unit=101 opens that unit (and its newest period) on arrival.
  useEffect(() => {
    if (!initialUnitNo) return;
    const match = tree.find(
      (n) => n.unit.unit_no.toLowerCase() === initialUnitNo.toLowerCase(),
    );
    if (!match) return;
    setExpandedUnits(new Set([match.unit.id]));
    const newest = match.periods[0];
    if (newest) {
      setExpandedPeriods(new Set([`${match.unit.id}::${newest.period}`]));
    }
    // Only runs for the initial deep link, not on every tree rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUnitNo]);

  // When the page loads with a pre-set filter (e.g. from clicking an Overview
  // tile), scroll the table into view so the user sees the filtered result
  // without having to manually scroll past the period summary above.
  useEffect(() => {
    if (initialFilter && initialFilter !== 'all' && tableRef.current) {
      setTimeout(() => {
        tableRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 150);
    }
    // Intentionally only on mount — we don't re-scroll on filter changes the
    // user makes themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
      (key: string) => {
        setter((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      },
    [],
  );

  const onToggleUnit = useMemo(() => toggle(setExpandedUnits), [toggle]);
  const onTogglePeriod = useMemo(() => toggle(setExpandedPeriods), [toggle]);
  const onToggleBill = useMemo(() => toggle(setExpandedBills), [toggle]);

  const onDetailLoaded = useCallback((billId: string, detail: BillDetail) => {
    setDetailCache((prev) => {
      const next = new Map(prev);
      next.set(billId, detail);
      return next;
    });
  }, []);

  const onToggleSelect = useCallback((unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedUnitIds((prev) => {
        const next = new Set(prev);
        paged.forEach((n) => next.delete(n.unit.id));
        return next;
      });
    } else {
      setSelectedUnitIds((prev) => {
        const next = new Set(prev);
        paged.forEach((n) => next.add(n.unit.id));
        return next;
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/billing/bills/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitIds: [...selectedUnitIds],
          accountSlug,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? 'Export failed. Please try again.');
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
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Keep ?unit= and ?filter= in the URL so a particular view is shareable,
  // without a Next.js navigation (which would refetch and lose scroll).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filter === 'all') params.delete('filter');
    else params.set('filter', filter);
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [filter]);

  const allExpanded =
    paged.length > 0 && paged.every((n) => expandedUnits.has(n.unit.id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedUnits(new Set());
      setExpandedPeriods(new Set());
    } else {
      setExpandedUnits(new Set(paged.map((n) => n.unit.id)));
      // Auto-open each unit's newest period so content is immediately visible.
      setExpandedPeriods(
        new Set(
          paged
            .filter((n) => n.periods.length > 0)
            .map((n) => `${n.unit.id}::${n.periods[0]!.period}`),
        ),
      );
    }
  };

  return (
    <div ref={tableRef} className="overflow-hidden rounded-xl border">
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
        <div className="relative min-w-[160px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit no or owner…"
            aria-label="Search units"
            className="h-8 pr-8 pl-8 text-sm"
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

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                filter === f.key
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label}
              <span className="ml-1 opacity-60">({counts[f.key]})</span>
            </button>
          ))}
        </div>

        {selectedUnitIds.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="h-8 gap-1.5 text-xs"
          >
            {isExporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Export PDFs ({selectedUnitIds.size})
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={paged.length === 0}
          className="ml-auto h-8 text-xs"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>

      {/* ── Column headers + rows wrapped for horizontal scroll on mobile ─ */}
      <div className="overflow-x-auto">
        {/* ── Column headers ─────────────────────────────────────────────── */}
        <div className="bg-muted/60 text-muted-foreground grid min-w-[640px] grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_110px_100px_100px_90px] items-center gap-2 border-b px-3 py-2 text-[10px] font-bold tracking-wider uppercase sm:grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_130px_110px_110px_100px] sm:px-4">
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

        {/* ── Rows ───────────────────────────────────────────────────────── */}
        {paged.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-14">
            <p className="text-sm font-semibold">No units match</p>
            <p className="text-muted-foreground text-xs">
              {search
                ? `Nothing found for "${search}".`
                : 'Try a different filter.'}
            </p>
            {(search || filter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
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
              expanded={expandedUnits.has(node.unit.id)}
              expandedPeriods={expandedPeriods}
              expandedBills={expandedBills}
              detailCache={detailCache}
              onToggleUnit={onToggleUnit}
              onTogglePeriod={onTogglePeriod}
              onToggleBill={onToggleBill}
              onDetailLoaded={onDetailLoaded}
              selected={selectedUnitIds.has(node.unit.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>
      {/* end overflow-x-auto */}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs sm:px-4">
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
