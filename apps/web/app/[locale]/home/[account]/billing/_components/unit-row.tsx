'use client';

import { memo } from 'react';

import Link from 'next/link';

import { ChevronRight } from 'lucide-react';

import { cn } from '@kit/ui/utils';

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { UNIT_STATUS_DOT, type UnitNode } from '../_lib/unit-billing-types';

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
  'grid min-w-[640px] grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_110px_100px_100px] items-center gap-2 sm:grid-cols-[20px_24px_minmax(90px,1fr)_minmax(0,1.2fr)_130px_110px_110px]';

/**
 * Level 1 of the billing drill-down: one unit, one row.
 *
 * The row links to the unit's own billing page rather than expanding in place.
 * That keeps this list's query free of per-bill detail - the periods, charge
 * types and line items are fetched only for the unit actually opened.
 */
function UnitRowInner({ node, href, selected, onToggleSelect }: Props) {
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
        {/* stopPropagation prevents the Link from navigating; no preventDefault
            so the browser's native checkbox toggle (and React's checked state)
            both render correctly. */}
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(unit.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select unit ${unit.unit_no}`}
            data-test={`unit-select-${unit.id}`}
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
          <span className="truncate text-base font-semibold">
            {unit.unit_no}
          </span>
        </div>

        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate">
            {unit.owner_name ?? (
              <span className="italic opacity-40">Vacant</span>
            )}
          </span>
        </div>

        <div className="text-muted-foreground truncate text-sm">
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
            node.outstanding > 0 ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {node.outstanding > 0 ? formatINR(node.outstanding) : '-'}
        </div>

        {/* Col 6 - overdue bill COUNT, never an amount, so it can't duplicate col 5 */}
        <div className="flex justify-end">
          {node.overdueCount > 0 ? (
            <span className="text-danger inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
              {node.overdueCount}
              <span className="font-normal opacity-70">
                {node.overdueCount === 1 ? ' bill' : ' bills'}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </div>
      </Link>
    </div>
  );
}

export const UnitRow = memo(UnitRowInner);
