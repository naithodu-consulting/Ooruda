'use client';

import { startTransition, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  TrendingUp,
  X,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { MetricCard } from '@kit/ui/metric-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import type { BillRow } from './bills-section';

type ActiveTile =
  | 'this-month'
  | 'outstanding'
  | 'overdue'
  | 'fully-paid'
  | null;

interface PeriodSummary {
  period: string;
  billCount: number;
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  overdueCount: number;
  collectionPct: number;
}

export function BillingOverview(props: {
  bills: BillRow[];
  accountSlug: string;
}) {
  const router = useRouter();
  const [activeTile, setActiveTile] = useState<ActiveTile>(null);

  const currentPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // KPIs from all bills — tiles filter the period table, not the KPIs
  const kpis = useMemo(() => {
    const thisMonth = props.bills.filter((b) => b.period === currentPeriod);
    const overdue = props.bills.filter(
      (b) => displayBillStatus(b) === 'Overdue',
    );
    const paid = props.bills.filter((b) => displayBillStatus(b) === 'Paid');
    return {
      thisMonthBilled: thisMonth.reduce((s, b) => s + b.total_amount, 0),
      thisMonthCollected: thisMonth.reduce((s, b) => s + b.paid_amount, 0),
      outstanding: props.bills.reduce(
        (s, b) => s + Math.max(0, b.total_amount - b.paid_amount),
        0,
      ),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce(
        (s, b) => s + Math.max(0, b.total_amount - b.paid_amount),
        0,
      ),
      paidCount: paid.length,
      paidAmount: paid.reduce((s, b) => s + b.total_amount, 0),
      totalBills: props.bills.length,
    };
  }, [props.bills, currentPeriod]);

  const thisMonthPct =
    kpis.thisMonthBilled > 0
      ? Math.round((kpis.thisMonthCollected / kpis.thisMonthBilled) * 100)
      : null;

  // Base period rows
  const allPeriodRows = useMemo((): PeriodSummary[] => {
    const map = new Map<string, PeriodSummary>();
    for (const b of props.bills) {
      const row = map.get(b.period) ?? {
        period: b.period,
        billCount: 0,
        totalBilled: 0,
        totalCollected: 0,
        outstanding: 0,
        overdueCount: 0,
        collectionPct: 0,
      };
      const isOverdue = displayBillStatus(b) === 'Overdue';
      map.set(b.period, {
        ...row,
        billCount: row.billCount + 1,
        totalBilled: row.totalBilled + b.total_amount,
        totalCollected: row.totalCollected + b.paid_amount,
        outstanding:
          row.outstanding + Math.max(0, b.total_amount - b.paid_amount),
        overdueCount: row.overdueCount + (isOverdue ? 1 : 0),
      });
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        collectionPct:
          row.totalBilled > 0
            ? Math.round((row.totalCollected / row.totalBilled) * 100)
            : 100,
      }))
      .sort((a, b) => b.period.localeCompare(a.period));
  }, [props.bills]);

  // Period rows filtered/sorted by active tile
  const periodRows = useMemo(() => {
    switch (activeTile) {
      case 'outstanding':
        // Show only periods with outstanding balance, sorted highest first
        return allPeriodRows
          .filter((r) => r.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding);
      case 'overdue':
        // Show only periods that have overdue bills, sorted by count desc
        return allPeriodRows
          .filter((r) => r.overdueCount > 0)
          .sort((a, b) => b.overdueCount - a.overdueCount);
      case 'fully-paid':
        // Show only periods where everything is collected (0 outstanding)
        return allPeriodRows.filter((r) => r.outstanding === 0);
      default:
        return allPeriodRows;
    }
  }, [allPeriodRows, activeTile]);

  function toggleTile(tile: ActiveTile) {
    startTransition(() => {
      setActiveTile((prev) => (prev === tile ? null : tile));
    });
  }

  function handleTileClick(tile: ActiveTile) {
    startTransition(() => {
      if (tile === 'this-month') {
        router.push(
          `/home/${props.accountSlug}/billing?period=${currentPeriod}`,
        );
        return;
      }
      if (tile === 'outstanding') {
        router.push(
          `/home/${props.accountSlug}/billing?status=outstanding&bills=open`,
        );
        return;
      }
      if (tile === 'overdue') {
        router.push(
          `/home/${props.accountSlug}/billing?status=overdue&bills=open`,
        );
        return;
      }
      if (tile === 'fully-paid') {
        router.push(
          `/home/${props.accountSlug}/billing?status=paid&bills=open`,
        );
        return;
      }
      toggleTile(tile);
    });
  }

  const tileFilterLabel =
    activeTile === 'overdue'
      ? 'Overdue periods only'
      : activeTile === 'outstanding'
        ? 'Periods with outstanding balance'
        : activeTile === 'fully-paid'
          ? 'Fully collected periods'
          : null;

  const emptyStateMessage =
    activeTile === 'overdue'
      ? 'No overdue bills — all periods are up to date.'
      : activeTile === 'outstanding'
        ? 'No outstanding balances — everything is collected.'
        : activeTile === 'fully-paid'
          ? 'No fully collected periods yet.'
          : 'No billing data yet.';

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TileButton
          active={activeTile === 'this-month'}
          onClick={() => handleTileClick('this-month')}
          tooltip="View this month's bill breakdown"
          data-test="tile-this-month"
        >
          <MetricCard
            icon={TrendingUp}
            label="This Month Billed"
            value={formatINR(kpis.thisMonthBilled)}
            sublabel={
              thisMonthPct !== null ? `${thisMonthPct}% collected` : undefined
            }
            variant="blue"
          />
        </TileButton>

        <TileButton
          active={activeTile === 'outstanding'}
          onClick={() => handleTileClick('outstanding')}
          tooltip="Show periods with outstanding balances"
          data-test="tile-outstanding"
        >
          <MetricCard
            icon={FileText}
            label="Outstanding"
            value={formatINR(kpis.outstanding)}
            sublabel={`${kpis.totalBills - kpis.paidCount} unpaid bills`}
            variant="amber"
          />
        </TileButton>

        <TileButton
          active={activeTile === 'overdue'}
          onClick={() => handleTileClick('overdue')}
          tooltip="Show periods with overdue bills"
          data-test="tile-overdue"
        >
          <MetricCard
            icon={AlertTriangle}
            label="Overdue"
            value={formatINR(kpis.overdueAmount)}
            sublabel={`${kpis.overdueCount} bill${kpis.overdueCount !== 1 ? 's' : ''}`}
            variant={kpis.overdueCount > 0 ? 'red' : 'green'}
          />
        </TileButton>

        <TileButton
          active={activeTile === 'fully-paid'}
          onClick={() => handleTileClick('fully-paid')}
          tooltip="Show fully collected periods"
          data-test="tile-fully-paid"
        >
          <MetricCard
            icon={CheckCircle2}
            label="Fully Paid"
            value={formatINR(kpis.paidAmount)}
            sublabel={`${kpis.paidCount} of ${kpis.totalBills} bills`}
            variant="green"
          />
        </TileButton>
      </div>

      {/* Period summary */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">Collection by Period</h3>
          {tileFilterLabel && (
            <button
              type="button"
              onClick={() => startTransition(() => setActiveTile(null))}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring hover:bg-accent flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
            >
              {tileFilterLabel}
              <X className="size-3" />
            </button>
          )}
        </div>

        {periodRows.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
            {emptyStateMessage}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-36">Period</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-32">Collection %</TableHead>
                  <TableHead className="w-20 text-center">Overdue</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodRows.map((row) => {
                  const isCurrent = row.period === currentPeriod;
                  const isHighlighted =
                    (activeTile === 'overdue' && row.overdueCount > 0) ||
                    (activeTile === 'outstanding' && row.outstanding > 0) ||
                    (activeTile === 'fully-paid' && row.outstanding === 0);

                  return (
                    <TableRow
                      key={row.period}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isHighlighted && 'bg-primary/[0.03]',
                      )}
                      onMouseEnter={() =>
                        router.prefetch(
                          `/home/${props.accountSlug}/billing?period=${row.period}`,
                        )
                      }
                      onClick={() =>
                        startTransition(() => {
                          router.push(
                            `/home/${props.accountSlug}/billing?period=${row.period}`,
                          );
                        })
                      }
                      data-test={`period-row-${row.period}`}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {formatPeriod(row.period)}
                          {isCurrent && (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] font-medium"
                            >
                              Current
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.billCount}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatINR(row.totalBilled)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatINR(row.totalCollected)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.outstanding > 0 ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            {formatINR(row.outstanding)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <CollectionBar pct={row.collectionPct} />
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {row.overdueCount > 0 ? (
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {row.overdueCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="text-muted-foreground size-4" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TileButton(props: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tooltip: string;
  'data-test'?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.tooltip}
      data-test={props['data-test']}
      className={cn(
        'block w-full cursor-pointer rounded-2xl text-left transition-all duration-150',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'hover:scale-[1.02] hover:shadow-md active:scale-[0.99]',
        props.active && 'ring-foreground/25 scale-[1.02] shadow-md ring-2',
      )}
    >
      {props.children}
    </button>
  );
}

function CollectionBar({ pct }: { pct: number }) {
  const color =
    pct >= 90
      ? 'bg-green-500 dark:bg-green-400'
      : pct >= 60
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-red-500 dark:bg-red-400';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'w-8 text-right text-xs font-semibold tabular-nums',
          pct >= 90
            ? 'text-green-700 dark:text-green-400'
            : pct >= 60
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400',
        )}
      >
        {pct}%
      </span>
    </div>
  );
}
