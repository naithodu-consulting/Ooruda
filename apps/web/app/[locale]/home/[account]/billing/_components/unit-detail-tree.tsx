'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { ChevronRight, Inbox, Trash2 } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { cn } from '@kit/ui/utils';

import { billStatusBadgeClassName } from '~/lib/bill-status';
import { formatDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import {
  billTypeLabel,
  type BillDetail,
  type BillTypeNode,
  type PeriodNode,
  type UnitNode,
} from '../_lib/unit-billing-types';
import { BillDetailPanel } from './bill-detail-panel';
import { VoidBillsBulkDialog } from './void-bill-dialog';

/**
 * Levels 2–4 of the billing tree — period → charge type → line items &
 * payments — for a single unit.
 *
 * These used to unfold inside the unit list, which meant every unit's bills had
 * to be loaded up front just in case a row was expanded. Scoped to one unit on
 * its own route, the tree is small enough to open instantly, and only the
 * innermost level still hits the network (`fetchBillDetailAction`).
 */
export function UnitBillingDetail({
  periods,
  drafts,
  canVoid = false,
  associationId = '',
}: {
  periods: PeriodNode[];
  drafts: UnitNode['drafts'];
  canVoid?: boolean;
  associationId?: string;
}) {
  // Newest period open on arrival — that is the one being chased.
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(
    () => new Set(periods[0] ? [periods[0].period] : []),
  );
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const [draftsOpen, setDraftsOpen] = useState(true);
  const [detailCache, setDetailCache] = useState<Map<string, BillDetail>>(
    new Map(),
  );

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

  const onTogglePeriod = useMemo(() => toggle(setExpandedPeriods), [toggle]);
  const onToggleBill = useMemo(() => toggle(setExpandedBills), [toggle]);

  const onDetailLoaded = useCallback((billId: string, detail: BillDetail) => {
    setDetailCache((prev) => new Map(prev).set(billId, detail));
  }, []);

  if (periods.length === 0 && drafts.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-10 text-center text-base">
        No bills have been generated for this unit yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {drafts.length > 0 && (
        <DraftPeriodRow
          drafts={drafts}
          expanded={draftsOpen}
          onToggle={() => setDraftsOpen((v) => !v)}
        />
      )}

      {periods.map((period) => (
        <PeriodRow
          key={period.period}
          period={period}
          expanded={expandedPeriods.has(period.period)}
          expandedBills={expandedBills}
          detailCache={detailCache}
          onToggle={() => onTogglePeriod(period.period)}
          onToggleBill={onToggleBill}
          onDetailLoaded={onDetailLoaded}
          canVoid={canVoid}
          associationId={associationId}
        />
      ))}
    </div>
  );
}

// ── Level 2: Period ──────────────────────────────────────────────────────────

// 7 cols — empty spacer at col 4 lines up the last-3 with UNIT_GRID's last-3.
const PERIOD_GRID =
  'grid min-w-[640px] grid-cols-[20px_minmax(90px,1fr)_minmax(0,0.9fr)_60px_100px_100px_90px] items-center gap-2 sm:grid-cols-[20px_minmax(90px,1fr)_minmax(0,0.9fr)_80px_110px_110px_100px]';

function PeriodRow({
  period,
  expanded,
  expandedBills,
  detailCache,
  onToggle,
  onToggleBill,
  onDetailLoaded,
  canVoid,
  associationId,
}: {
  period: PeriodNode;
  expanded: boolean;
  expandedBills: Set<string>;
  detailCache: Map<string, BillDetail>;
  onToggle: () => void;
  onToggleBill: (billId: string) => void;
  onDetailLoaded: (billId: string, detail: BillDetail) => void;
  canVoid: boolean;
  associationId: string;
}) {
  const router = useRouter();
  const [bulkVoidOpen, setBulkVoidOpen] = useState(false);
  const liveBillCount = period.bills.filter(
    (n) => n.displayStatus !== 'Void',
  ).length;
  // Hide bulk void on fully-paid periods — every live bill has payments, so
  // void_bills_bulk would skip them all anyway. No point offering the action.
  const showBulkVoid =
    canVoid && liveBillCount > 0 && period.status !== 'all_paid';

  return (
    <div className="border-b last:border-b-0">
      {bulkVoidOpen && (
        <VoidBillsBulkDialog
          open={bulkVoidOpen}
          associationId={associationId}
          period={period.period}
          periodLabel={formatPeriod(period.period)}
          billCount={liveBillCount}
          onClose={() => setBulkVoidOpen(false)}
          onVoided={() => {
            setBulkVoidOpen(false);
            router.refresh();
          }}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          PERIOD_GRID,
          'hover:bg-muted/40 cursor-pointer py-2 pr-3 pl-8 transition-colors sm:pr-4 sm:pl-11',
          expanded && 'bg-muted/30',
        )}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground/60 h-3.5 w-3.5 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />

        <span className="truncate text-sm font-semibold">
          {formatPeriod(period.period)}
        </span>

        {/* Collection progress bar — maps to "Owner" column */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="bg-muted h-1.5 w-full max-w-[70px] shrink-0 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                period.collectionPct >= 100
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-warning)]',
              )}
              style={{ width: `${Math.min(100, period.collectionPct)}%` }}
            />
          </div>
          <span className="text-muted-foreground shrink-0 text-[13px] tabular-nums">
            {Math.round(period.collectionPct)}%
          </span>
        </div>

        {/* Spacer — aligns the next three cols with UNIT_GRID cols 5-7 */}
        <div />

        {/* Col 5 — outstanding (aligns with unit "Outstanding" header) */}
        <div className="text-right">
          <div
            className={cn(
              'text-sm tabular-nums',
              period.outstanding > 0
                ? 'font-semibold text-[var(--color-warning)]'
                : 'text-muted-foreground',
            )}
          >
            {period.outstanding > 0 ? formatINR(period.outstanding) : '—'}
          </div>
          {period.outstanding > 0 && (
            <div className="text-muted-foreground/50 text-xs">outstanding</div>
          )}
        </div>

        {/* Col 6 — total billed (aligns with unit "Overdue" header) */}
        <div className="text-right">
          <div className="text-muted-foreground text-sm tabular-nums">
            {formatINR(period.billed)}
          </div>
          <div className="text-muted-foreground/50 text-xs">billed</div>
        </div>

        {/* Col 7 — bill count + optional bulk void (aligns with unit "Status" header) */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted-foreground text-xs">
            {period.bills.length} bill{period.bills.length !== 1 ? 's' : ''}
          </span>
          {showBulkVoid && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 shrink-0 gap-1 border-[var(--color-danger)]/40 px-1.5 text-xs text-[var(--color-danger)] hover:border-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
              title="Void all bills for this period"
              onClick={(e) => {
                e.stopPropagation();
                setBulkVoidOpen(true);
              }}
            >
              <Trash2 className="h-3 w-3" />
              Void
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t">
          {period.bills.map((node) => (
            <BillTypeRow
              key={node.bill.id}
              node={node}
              expanded={expandedBills.has(node.bill.id)}
              detail={detailCache.get(node.bill.id) ?? null}
              onToggle={() => onToggleBill(node.bill.id)}
              onDetailLoaded={onDetailLoaded}
              canVoid={canVoid}
              associationId={associationId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Level 3: Bill type ───────────────────────────────────────────────────────

// 5 cols — col 3 is a spacer; last 2 match UNIT_GRID cols 5-6 exactly.
const TYPE_GRID =
  'grid min-w-[640px] grid-cols-[18px_minmax(0,1fr)_60px_100px_100px] items-center gap-2 sm:grid-cols-[18px_minmax(0,1fr)_80px_110px_110px]';

function BillTypeRow({
  node,
  expanded,
  detail,
  onToggle,
  onDetailLoaded,
  canVoid,
  associationId,
}: {
  node: BillTypeNode;
  expanded: boolean;
  detail: BillDetail | null;
  onToggle: () => void;
  onDetailLoaded: (billId: string, detail: BillDetail) => void;
  canVoid: boolean;
  associationId: string;
}) {
  const router = useRouter();
  const { bill, displayStatus, outstanding, daysOverdue } = node;
  const isVoided = displayStatus === 'Void';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          TYPE_GRID,
          'hover:bg-muted/30 cursor-pointer border-b py-2 pr-3 pl-12 text-sm transition-colors sm:pr-4 sm:pl-20',
          expanded && 'bg-muted/40',
        )}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground/50 h-3.5 w-3.5 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />

        {/* Col 2: bill identity — label, overdue days, bill no */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'truncate text-sm font-medium',
                isVoided && 'text-muted-foreground line-through',
              )}
            >
              {billTypeLabel(bill.bill_type)}
            </span>
            {daysOverdue > 0 && (
              <span className="shrink-0 text-xs text-[var(--color-danger)]">
                {daysOverdue}d past due
              </span>
            )}
          </div>
          <span className="text-muted-foreground font-mono text-xs">
            {bill.bill_no}
          </span>
        </div>

        {/* Col 3: spacer — aligns cols 4-6 with UNIT_GRID cols 5-7 */}
        <div />

        {/* Col 4 — total billed (aligns with "Outstanding" header) */}
        <div className="text-right">
          <div className="text-sm tabular-nums">
            {formatINR(bill.total_amount)}
          </div>
          <div className="text-muted-foreground/50 text-xs">total</div>
        </div>

        {/* Col 5 — outstanding or paid (aligns with "Overdue" header) */}
        <div className="text-right">
          <div
            className={cn(
              'text-sm tabular-nums',
              outstanding > 0
                ? 'font-semibold text-[var(--color-warning)]'
                : 'text-[var(--color-success)]',
            )}
          >
            {outstanding > 0
              ? formatINR(outstanding)
              : formatINR(bill.paid_amount + bill.advance_applied)}
          </div>
          <div className="text-muted-foreground/50 text-xs">
            {outstanding > 0 ? 'owed' : 'paid'}
          </div>
        </div>

      </div>

      {expanded && (
        <BillDetailPanel
          bill={bill}
          detail={detail}
          onLoaded={onDetailLoaded}
          associationId={associationId}
          canVoid={canVoid}
          onVoided={() => router.refresh()}
        />
      )}
    </>
  );
}

// ── Draft pseudo-period ──────────────────────────────────────────────────────

function DraftPeriodRow({
  drafts,
  expanded,
  onToggle,
}: {
  drafts: UnitNode['drafts'];
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = drafts.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="border-b">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          PERIOD_GRID,
          'hover:bg-muted/40 cursor-pointer py-2 pr-3 pl-8 transition-colors sm:pr-4 sm:pl-11',
          expanded && 'bg-muted/30',
        )}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground/60 h-3.5 w-3.5 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />

        <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-[var(--color-info)]">
          <Inbox className="h-3 w-3 shrink-0" />
          Pending
        </span>

        <span className="text-muted-foreground truncate text-[13px]">
          {drafts.length} unbilled item{drafts.length !== 1 ? 's' : ''}
        </span>

        {/* Spacer col */}
        <div />

        <div className="text-right text-sm text-[var(--color-info)] tabular-nums">
          {formatINR(total)}
        </div>

        <div />

        <div className="flex justify-end">
          <Badge
            variant="outline"
            className="border-[var(--color-info)]/40 text-xs text-[var(--color-info)]"
          >
            Draft
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 pl-12 sm:pl-20">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="flex items-baseline justify-between gap-4 border-b py-1.5 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <span className="truncate">{d.label}</span>
                <span className="text-muted-foreground ml-1.5 text-xs">
                  {formatPeriod(d.period)} ·{' '}
                  {d.kind === 'sinking_fund' ? 'Sinking Fund' : 'Other Charges'}
                  {d.due_date ? ` · due ${formatDateDMY(d.due_date)}` : ''}
                </span>
              </div>
              <span className="shrink-0 tabular-nums">
                {formatINR(d.amount)}
              </span>
            </div>
          ))}
          <p className="text-muted-foreground mt-2 text-xs">
            These become bills the next time you run Generate Bills.
          </p>
        </div>
      )}
    </div>
  );
}
