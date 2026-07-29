'use client';

import { ChevronRight, Inbox } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

import { billStatusBadgeClassName } from '~/lib/bill-status';
import { formatDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import type { BillDetail } from '../_lib/unit-billing-types';
import {
  billTypeLabel,
  UNIT_STATUS_DOT,
  UNIT_STATUS_LABEL,
  type BillTypeNode,
  type PeriodNode,
  type UnitNode,
} from '../_lib/unit-billing-types';
import { BillDetailPanel } from './bill-detail-panel';

interface Props {
  node: UnitNode;
  expanded: boolean;
  expandedPeriods: Set<string>;
  expandedBills: Set<string>;
  detailCache: Map<string, BillDetail>;
  onToggleUnit: (unitId: string) => void;
  onTogglePeriod: (key: string) => void;
  onToggleBill: (billId: string) => void;
  onDetailLoaded: (billId: string, detail: BillDetail) => void;
  selected: boolean;
  onToggleSelect: (unitId: string) => void;
}

/**
 * Shared column templates. The rightmost three fixed-width columns are
 * identical across all three grid variants so financial amounts line up
 * vertically regardless of how deeply a row is indented.
 *
 *  col 5  col 6  col 7
 * ──────────────────────
 *  100px  100px   90px  ← base
 *  110px  110px  100px  ← sm
 */
const UNIT_GRID =
  'grid grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_110px_100px_100px_90px] items-center gap-2 sm:grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_130px_110px_110px_100px]';

export function UnitRow({
  node,
  expanded,
  expandedPeriods,
  expandedBills,
  detailCache,
  onToggleUnit,
  onTogglePeriod,
  onToggleBill,
  onDetailLoaded,
  selected,
  onToggleSelect,
}: Props) {
  const { unit } = node;
  const hasContent = node.periods.length > 0 || node.drafts.length > 0;

  return (
    <div className="border-b last:border-b-0">
      {/* ── Level 1: Unit ─────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={hasContent ? 0 : -1}
        aria-expanded={expanded}
        onClick={() => hasContent && onToggleUnit(unit.id)}
        onKeyDown={(e) => {
          if (!hasContent) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleUnit(unit.id);
          }
        }}
        className={cn(
          UNIT_GRID,
          'px-3 py-2.5 transition-colors sm:px-4',
          hasContent
            ? 'hover:bg-muted/50 cursor-pointer'
            : 'cursor-default opacity-70',
          expanded && 'bg-muted/60',
        )}
      >
        {/* Checkbox col */}
        <div
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(unit.id)}
            aria-label={`Select unit ${unit.unit_no}`}
            className="h-3.5 w-3.5 cursor-pointer rounded"
          />
        </div>

        <ChevronRight
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform',
            expanded && 'rotate-90',
            !hasContent && 'opacity-25',
          )}
        />

        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              UNIT_STATUS_DOT[node.status],
            )}
            aria-hidden
          />
          <span className="truncate text-sm font-semibold">{unit.unit_no}</span>
        </div>

        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate">
            {unit.owner_name ?? (
              <span className="italic opacity-40">Vacant</span>
            )}
          </span>
          {unit.advance_balance > 0 && (
            <Badge
              variant="outline"
              className="shrink-0 border-blue-300 px-1 py-0 text-[9px] text-blue-600 dark:text-blue-400"
              title="Advance credit available for this unit"
            >
              +{formatINR(unit.advance_balance)}
            </Badge>
          )}
        </div>

        <div className="text-muted-foreground truncate text-[11px]">
          {node.lastPeriod ? (
            <>
              {formatPeriod(node.lastPeriod)}
              <span className="hidden sm:inline">
                {' · '}
                {node.lastPeriodTypeCount} bill
                {node.lastPeriodTypeCount !== 1 ? 's' : ''}
              </span>
            </>
          ) : (
            'No bills yet'
          )}
        </div>

        <div
          className={cn(
            'text-right text-sm font-semibold tabular-nums',
            node.outstanding > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
          )}
        >
          {node.outstanding > 0 ? formatINR(node.outstanding) : '—'}
        </div>

        {/* Col 6 — overdue bill COUNT, never an amount, so it can't duplicate col 5 */}
        <div className="flex justify-end">
          {node.overdueCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600 tabular-nums dark:text-red-400">
              {node.overdueCount}
              <span className="font-normal opacity-70">
                {node.overdueCount === 1 ? ' bill' : ' bills'}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>

        {/* Col 7 — status badge, styled consistently for all four states */}
        <div className="flex justify-end">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              node.status === 'all_paid' && billStatusBadgeClassName('Paid'),
              node.status === 'partial' && billStatusBadgeClassName('Partial'),
              node.status === 'overdue' && billStatusBadgeClassName('Overdue'),
              node.status === 'no_bills' &&
                'border-muted-foreground/30 text-muted-foreground',
            )}
          >
            {UNIT_STATUS_LABEL[node.status]}
          </Badge>
        </div>
      </div>

      {/* ── Level 2+ ──────────────────────────────────────────────────── */}
      {expanded && (
        <div className="bg-background border-t">
          {/* Unbilled drafts surface as a pseudo-period pinned above the real
              billing periods — they're what needs action next. */}
          {node.drafts.length > 0 && (
            <DraftPeriodRow
              drafts={node.drafts}
              expanded={expandedPeriods.has(`${unit.id}::__drafts__`)}
              onToggle={() => onTogglePeriod(`${unit.id}::__drafts__`)}
            />
          )}

          {node.periods.map((period) => (
            <PeriodRow
              key={period.period}
              period={period}
              expanded={expandedPeriods.has(`${unit.id}::${period.period}`)}
              expandedBills={expandedBills}
              detailCache={detailCache}
              onToggle={() => onTogglePeriod(`${unit.id}::${period.period}`)}
              onToggleBill={onToggleBill}
              onDetailLoaded={onDetailLoaded}
            />
          ))}

          {node.periods.length === 0 && node.drafts.length === 0 && (
            <p className="text-muted-foreground px-4 py-4 pl-11 text-xs">
              No bills have been generated for this unit yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Level 2: Period ──────────────────────────────────────────────────────────

// 7 cols — empty spacer at col 4 lines up the last-3 with UNIT_GRID's last-3.
const PERIOD_GRID =
  'grid grid-cols-[20px_minmax(90px,1fr)_minmax(0,0.9fr)_60px_100px_100px_90px] items-center gap-2 sm:grid-cols-[20px_minmax(90px,1fr)_minmax(0,0.9fr)_80px_110px_110px_100px]';

function PeriodRow({
  period,
  expanded,
  expandedBills,
  detailCache,
  onToggle,
  onToggleBill,
  onDetailLoaded,
}: {
  period: PeriodNode;
  expanded: boolean;
  expandedBills: Set<string>;
  detailCache: Map<string, BillDetail>;
  onToggle: () => void;
  onToggleBill: (billId: string) => void;
  onDetailLoaded: (billId: string, detail: BillDetail) => void;
}) {
  return (
    <div className="border-b last:border-b-0">
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

        <span className="truncate text-xs font-semibold">
          {formatPeriod(period.period)}
        </span>

        {/* Collection progress bar — maps to "Owner" column */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="bg-muted h-1.5 w-full max-w-[70px] shrink-0 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                period.collectionPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              style={{ width: `${Math.min(100, period.collectionPct)}%` }}
            />
          </div>
          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
            {Math.round(period.collectionPct)}%
          </span>
        </div>

        {/* Spacer — aligns the next three cols with UNIT_GRID cols 5-7 */}
        <div />

        {/* Col 5 — outstanding (aligns with unit "Outstanding" header) */}
        <div className="text-right">
          <div
            className={cn(
              'text-xs tabular-nums',
              period.outstanding > 0
                ? 'font-semibold text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground',
            )}
          >
            {period.outstanding > 0 ? formatINR(period.outstanding) : '—'}
          </div>
          {period.outstanding > 0 && (
            <div className="text-muted-foreground/50 text-[9px]">
              outstanding
            </div>
          )}
        </div>

        {/* Col 6 — total billed (aligns with unit "Overdue" header) */}
        <div className="text-right">
          <div className="text-muted-foreground text-xs tabular-nums">
            {formatINR(period.billed)}
          </div>
          <div className="text-muted-foreground/50 text-[9px]">billed</div>
        </div>

        {/* Col 7 — bill count (aligns with unit "Status" header) */}
        <div className="flex justify-end">
          <span className="text-muted-foreground text-[10px]">
            {period.bills.length} bill{period.bills.length !== 1 ? 's' : ''}
          </span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Level 3: Bill type ───────────────────────────────────────────────────────

// 6 cols — col 3 is a spacer; last 3 match UNIT_GRID cols 5-7 exactly.
const TYPE_GRID =
  'grid grid-cols-[18px_minmax(0,1fr)_60px_100px_100px_90px] items-center gap-2 sm:grid-cols-[18px_minmax(0,1fr)_80px_110px_110px_100px]';

function BillTypeRow({
  node,
  expanded,
  detail,
  onToggle,
  onDetailLoaded,
}: {
  node: BillTypeNode;
  expanded: boolean;
  detail: BillDetail | null;
  onToggle: () => void;
  onDetailLoaded: (billId: string, detail: BillDetail) => void;
}) {
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
          'hover:bg-muted/40 bg-muted/10 cursor-pointer border-b py-2 pr-3 pl-12 text-xs transition-colors sm:pr-4 sm:pl-20',
          expanded && 'bg-muted/40',
        )}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground/50 h-3 w-3 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />

        {/* Col 2: bill identity — label, overdue days, bill no */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'truncate text-xs font-medium',
                isVoided && 'text-muted-foreground line-through',
              )}
            >
              {billTypeLabel(bill.bill_type)}
            </span>
            {daysOverdue > 0 && (
              <span className="shrink-0 text-[9px] text-red-600 dark:text-red-400">
                {daysOverdue}d past due
              </span>
            )}
          </div>
          <span className="text-muted-foreground font-mono text-[10px]">
            {bill.bill_no}
          </span>
        </div>

        {/* Col 3: spacer — aligns cols 4-6 with UNIT_GRID cols 5-7 */}
        <div />

        {/* Col 4 — total billed (aligns with "Outstanding" header) */}
        <div className="text-right">
          <div className="text-xs tabular-nums">
            {formatINR(bill.total_amount)}
          </div>
          <div className="text-muted-foreground/50 text-[9px]">total</div>
        </div>

        {/* Col 5 — outstanding or paid (aligns with "Overdue" header) */}
        <div className="text-right">
          <div
            className={cn(
              'text-xs tabular-nums',
              outstanding > 0
                ? 'font-semibold text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {outstanding > 0
              ? formatINR(outstanding)
              : formatINR(bill.paid_amount)}
          </div>
          <div className="text-muted-foreground/50 text-[9px]">
            {outstanding > 0 ? 'owed' : 'paid'}
          </div>
        </div>

        {/* Col 6 — status badge (aligns with "Status" header) */}
        <div className="flex justify-end">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              billStatusBadgeClassName(displayStatus),
            )}
          >
            {displayStatus}
          </Badge>
        </div>
      </div>

      {expanded && (
        <BillDetailPanel
          bill={bill}
          detail={detail}
          onLoaded={onDetailLoaded}
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

        <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-blue-600 dark:text-blue-400">
          <Inbox className="h-3 w-3 shrink-0" />
          Pending
        </span>

        <span className="text-muted-foreground truncate text-[11px]">
          {drafts.length} unbilled item{drafts.length !== 1 ? 's' : ''}
        </span>

        {/* Spacer col */}
        <div />

        <div className="text-right text-xs text-blue-600 tabular-nums dark:text-blue-400">
          {formatINR(total)}
        </div>

        <div />

        <div className="flex justify-end">
          <Badge
            variant="outline"
            className="border-blue-300 text-[10px] text-blue-600 dark:text-blue-400"
          >
            Draft
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className="bg-muted/10 border-t px-3 py-2 pl-12 sm:pl-20">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="flex items-baseline justify-between gap-4 border-b py-1.5 text-xs last:border-b-0"
            >
              <div className="min-w-0">
                <span className="truncate">{d.label}</span>
                <span className="text-muted-foreground ml-1.5 text-[10px]">
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
          <p className="text-muted-foreground mt-2 text-[10px]">
            These become bills the next time you run Generate Bills.
          </p>
        </div>
      )}
    </div>
  );
}
