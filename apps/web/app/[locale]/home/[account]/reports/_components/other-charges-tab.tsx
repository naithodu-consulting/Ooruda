'use client';

import { useMemo, useState } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatINR } from '~/lib/format-inr';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import type { OtherChargeRow, OtherChargeUnitRow } from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';

// Colour palette for bars — cycles if more charge types than colours
const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ec4899',
  '#8b5cf6', '#0ea5e9', '#f97316', '#14b8a6',
];

function pct(collected: number, billed: number) {
  if (!billed) return 0;
  return Math.round((collected / billed) * 100);
}

interface Props {
  associationId: string;
  from: string;
  to: string;
  unitIds: string[];
  rows: OtherChargeRow[];
}

export function OtherChargesTab({ associationId, from, to, unitIds, rows }: Props) {
  const [activeCharge, setActiveCharge] = useState<string | null>(null);
  const [unitRows, setUnitRows] = useState<OtherChargeUnitRow[]>([]);
  const [unitLoading, setUnitLoading] = useState(false);
  const supabase = useSupabase();

  // ── Summary KPIs ────────────────────────────────────────────────────────────
  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const chargeCount = rows.length;

  // ── Bar chart: billed vs collected per charge ──────────────────────────────
  const chartData = useMemo(
    () =>
      rows.slice(0, 10).map((r) => ({
        name:
          r.charge_name.length > 18
            ? r.charge_name.slice(0, 16) + '…'
            : r.charge_name,
        fullName: r.charge_name,
        billed: r.billed,
        collected: r.collected,
        outstanding: r.outstanding,
      })),
    [rows],
  );

  // ── Unit breakdown fetch ────────────────────────────────────────────────────
  // Done client-side from the already-fetched bills because:
  // 1. No extra round-trip for common drill-downs
  // 2. Data is already in memory from the tab fetch
  // We re-use associationId + from/to + unitIds via a lightweight server action.
  // For simplicity, derive unit rows from the parent rows prop filtered to the
  // selected charge. The per-unit breakdown is fetched lazily via a direct
  // Supabase query inside the tab.

  const handleRowClick = async (chargeName: string) => {
    if (activeCharge === chargeName) {
      setActiveCharge(null);
      setUnitRows([]);
      return;
    }

    setActiveCharge(chargeName);
    setUnitLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('bills')
        .select(
          'id, unit_id, total_amount, paid_amount, advance_applied, status, due_date, period, units(unit_no), bill_line_items(description, amount)',
        )
        .eq('association_id', associationId)
        .eq('bill_type', 'other_charges')
        .neq('status', 'Reversed')
        .neq('status', 'Void');

      const fromPeriod = from ? from.slice(0, 7) : null;
      const toPeriod = to ? to.slice(0, 7) : null;
      if (fromPeriod) q = q.gte('period', fromPeriod);
      if (toPeriod) q = q.lte('period', toPeriod);
      if (unitIds.length > 0) q = q.in('unit_id', unitIds);

      const { data } = await q;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      type UnitAgg = {
        unit_no: string;
        bill_ids: Set<string>;
        billed: number;
        collected: number;
        has_overdue: boolean;
      };
      const unitMap = new Map<string, UnitAgg>();

      for (const bill of data ?? []) {
        const lineItems: { description: string; amount: number }[] =
          bill.bill_line_items ?? [];
        const relevantItems = lineItems.filter(
          (li: { description: string }) => li.description?.trim() === chargeName,
        );
        if (relevantItems.length === 0) continue;

        const billTotal = Number(bill.total_amount) || 0;
        const billPaid =
          Number(bill.paid_amount) + Number(bill.advance_applied);
        const unit_no =
          (bill.units as { unit_no: string } | null)?.unit_no ?? '—';
        const uid: string = bill.unit_id;
        const isOverdue =
          billPaid < billTotal && new Date(bill.due_date) < today;

        const agg = unitMap.get(uid) ?? {
          unit_no,
          bill_ids: new Set<string>(),
          billed: 0,
          collected: 0,
          has_overdue: false,
        };

        for (const item of relevantItems) {
          const itemAmt = Number(item.amount);
          const fraction = billTotal > 0 ? itemAmt / billTotal : 0;
          const itemCollected = Math.min(
            itemAmt,
            Math.round(billPaid * fraction * 100) / 100,
          );
          agg.billed += itemAmt;
          agg.collected += itemCollected;
        }
        agg.bill_ids.add(bill.id);
        if (isOverdue) agg.has_overdue = true;
        unitMap.set(uid, agg);
      }

      const result: OtherChargeUnitRow[] = Array.from(unitMap.values())
        .map((v) => {
          const outstanding = Math.max(0, v.billed - v.collected);
          let status: OtherChargeUnitRow['status'] = 'paid';
          if (outstanding > 0) {
            status = v.has_overdue ? 'overdue' : v.collected > 0 ? 'partial' : 'unpaid';
          }
          return {
            unit_no: v.unit_no,
            bill_count: v.bill_ids.size,
            billed: v.billed,
            collected: v.collected,
            outstanding,
            status,
          };
        })
        .sort((a, b) => b.outstanding - a.outstanding);

      setUnitRows(result);
    } finally {
      setUnitLoading(false);
    }
  };

  const STATUS_BADGE: Record<
    OtherChargeUnitRow['status'],
    { label: string; className: string }
  > = {
    paid: { label: 'Paid', className: 'text-green-700' },
    partial: { label: 'Partial', className: 'text-amber-700' },
    unpaid: { label: 'Unpaid', className: 'text-red-700' },
    overdue: { label: 'Overdue', className: 'text-red-900 font-semibold' },
  };

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-sm">
          No other charges found for this period.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Charge types"
          value={chargeCount.toString()}
          sub="distinct charges"
        />
        <KpiTile
          label="Total billed"
          value={formatINR(totalBilled)}
          sub={`across ${rows.reduce((s, r) => s + r.bill_count, 0)} bills`}
        />
        <KpiTile
          label="Collected"
          value={formatINR(totalCollected)}
          sub={`${pct(totalCollected, totalBilled)}% collection rate`}
        />
        <KpiTile
          label="Outstanding"
          value={formatINR(totalOutstanding)}
          sub="pending collection"
          highlight={totalOutstanding > 0 ? 'red' : undefined}
        />
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Billed vs Collected by Charge Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                barCategoryGap="35%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 100000
                      ? `₹${(v / 100000).toFixed(1)}L`
                      : v >= 1000
                        ? `₹${(v / 1000).toFixed(0)}K`
                        : `₹${v}`
                  }
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any, name: any) => [
                    formatINR(val as number),
                    name === 'billed' ? 'Billed' : 'Collected',
                  ]}
                  labelFormatter={(_, payload) =>
                    (payload as any)?.[0]?.payload?.fullName ?? ''
                  }
                />
                <Bar dataKey="billed" radius={[3, 3, 0, 0]} maxBarSize={40}>
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PALETTE[i % PALETTE.length]}
                      fillOpacity={0.35}
                    />
                  ))}
                </Bar>
                <Bar dataKey="collected" radius={[3, 3, 0, 0]} maxBarSize={40}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Charge summary table — click a row to drill down */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Charge Summary
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              Click a row to see unit breakdown
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge name</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.charge_name}
                    data-test={`other-charge-row-${r.charge_name}`}
                    className={`cursor-pointer transition-colors ${
                      activeCharge === r.charge_name
                        ? 'bg-primary/5 hover:bg-primary/8'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleRowClick(r.charge_name)}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {activeCharge === r.charge_name && (
                          <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                        )}
                        {r.charge_name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.bill_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.unit_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(r.billed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(r.collected)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.outstanding > 0
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {r.outstanding > 0 ? formatINR(r.outstanding) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums text-xs">
                      {pct(r.collected, r.billed)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Unit breakdown — shown when a charge row is active */}
      {activeCharge && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Unit Breakdown ·{' '}
              <span className="text-primary">{activeCharge}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {unitLoading ? (
              <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
                Loading…
              </div>
            ) : unitRows.length === 0 ? (
              <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
                No unit data found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unitRows.map((r) => {
                      const badge = STATUS_BADGE[r.status];
                      return (
                        <TableRow key={r.unit_no}>
                          <TableCell className="font-medium">
                            {r.unit_no}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.bill_count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(r.billed)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(r.collected)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              r.outstanding > 0
                                ? 'text-destructive font-medium'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {r.outstanding > 0
                              ? formatINR(r.outstanding)
                              : '—'}
                          </TableCell>
                          <TableCell
                            className={`text-right text-xs ${badge.className}`}
                          >
                            {badge.label}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals */}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {unitRows.reduce((s, r) => s + r.bill_count, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(unitRows.reduce((s, r) => s + r.billed, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(unitRows.reduce((s, r) => s + r.collected, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(unitRows.reduce((s, r) => s + r.outstanding, 0))}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
