'use client';

import Link from 'next/link';

import { ChevronRight } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

import { billStatusBadgeClassName } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import {
  UNIT_STATUS_DOT,
  UNIT_STATUS_LABEL,
  type UnitNode,
} from '../_lib/unit-billing-types';

interface Props {
  node: UnitNode;
  /** Level-3 route for this unit. */
  href: string;
  selected: boolean;
  onToggleSelect: (unitId: string) => void;
}

/**
 * Shared column template. The rightmost three fixed-width columns match the
 * header row in `unit-billing-table.tsx` so amounts line up.
 */
export const UNIT_GRID =
  'grid min-w-[640px] grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_110px_100px_100px_90px] items-center gap-2 sm:grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_130px_110px_110px_100px]';

/**
 * Level 1 of the billing drill-down: one unit, one row.
 *
 * The row links to the unit's own billing page rather than expanding in place.
 * That keeps this list's query free of per-bill detail — the periods, charge
 * types and line items are fetched only for the unit actually opened.
 */
export function UnitRow({ node, href, selected, onToggleSelect }: Props) {
  const { unit } = node;

  return (
    <div className="border-b last:border-b-0">
      <Link
        href={href}
        className={cn(
          UNIT_GRID,
          'group hover:bg-muted/50 focus-visible:ring-ring px-3 py-3 transition-colors focus-visible:ring-1 focus-visible:outline-none sm:px-4',
        )}
      >
        {/* Selection is an action on the row, not navigation — swallow the
            click so ticking a box never opens the unit. */}
        <div
          className="flex items-center justify-center"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(unit.id)}
            aria-label={`Select unit ${unit.unit_no}`}
            className="h-3.5 w-3.5 cursor-pointer rounded"
          />
        </div>

        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />

        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              UNIT_STATUS_DOT[node.status],
            )}
            aria-hidden
          />
          <span className="truncate text-base font-semibold">{unit.unit_no}</span>
        </div>

        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate">
            {unit.owner_name ?? (
              <span className="italic opacity-40">Vacant</span>
            )}
          </span>
        </div>

        <div className="text-muted-foreground truncate text-[13px]">
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
            'text-right text-base font-semibold tabular-nums',
            node.outstanding > 0
              ? 'text-[var(--color-warning)]'
              : 'text-muted-foreground',
          )}
        >
          {node.outstanding > 0 ? formatINR(node.outstanding) : '—'}
        </div>

        {/* Col 6 — overdue bill COUNT, never an amount, so it can't duplicate col 5 */}
        <div className="flex justify-end">
          {node.overdueCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-[var(--color-danger)] tabular-nums">
              {node.overdueCount}
              <span className="font-normal opacity-70">
                {node.overdueCount === 1 ? ' bill' : ' bills'}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>

        {/* Col 7 — status badge, styled consistently for all four states */}
        <div className="flex justify-end">
          <Badge
            variant="outline"
            className={cn(
              'text-sm',
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
      </Link>
    </div>
  );
}
