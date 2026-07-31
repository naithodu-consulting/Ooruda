'use client';

import { useMemo, useState } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import {
  billTypeLabel,
  BILL_TYPE_COLORS,
  type CollectionRow,
  type PaymentRow,
} from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';

interface Props {
  rows: CollectionRow[]; // bills grouped by bill period
  payments: PaymentRow[]; // payments grouped by paid_at date
}

const BILL_TYPES = [
  'maintenance',
  'electricity',
  'sinking_fund',
  'other_charges',
  'dg_usage',
  'water',
];

function shortPeriod(p: string) {
  const [y, m] = p.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1).toLocaleString('en-IN', {
    month: 'short',
    year: '2-digit',
  });
}

function inrK(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val.toFixed(0)}`;
}

type View = 'received' | 'raised';

export function CollectionTab({ rows, payments }: Props) {
  // Default to "Payments Received" (payment-date-based) so
  // "This FY" always shows money that actually came in.
  const [view, setView] = useState<View>('received');
  const [activeBillType, setActiveBillType] = useState<string | null>(null);

  // ── Payment-date-based aggregation (primary, correct for "This FY") ──────────

  const filteredPayments = activeBillType
    ? payments.filter((p) => p.bill_type === activeBillType)
    : payments;

  // Group payments by paid_at month
  const receivedByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of filteredPayments) {
      const month = p.paid_at.slice(0, 7); // YYYY-MM
      map.set(month, (map.get(month) ?? 0) + p.amount);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, received]) => ({
        period: shortPeriod(period),
        fullPeriod: formatPeriod(period),
        received,
      }));
  }, [filteredPayments]);

  const totalReceived = filteredPayments.reduce((s, p) => s + p.amount, 0);
  const paymentCount = filteredPayments.length;

  // Donut: by bill type (from payments)
  const donutData = useMemo(() => {
    const byType = new Map<string, number>();
    for (const p of payments) {
      byType.set(p.bill_type, (byType.get(p.bill_type) ?? 0) + p.amount);
    }
    return BILL_TYPES.filter((t) => (byType.get(t) ?? 0) > 0).map((t) => ({
      name: billTypeLabel(t),
      value: byType.get(t) ?? 0,
      key: t,
      color: BILL_TYPE_COLORS[t] ?? '#8b5cf6',
    }));
  }, [payments]);

  // ── Bill-period-based aggregation (secondary, "Bills Raised") ────────────────

  const filteredRows = activeBillType
    ? rows.filter((r) => r.bill_type === activeBillType)
    : rows;

  const raisedTotals = useMemo(() => {
    const billed = filteredRows.reduce((s, r) => s + r.billed, 0);
    const collected = filteredRows.reduce((s, r) => s + r.collected, 0);
    const billCount = filteredRows.reduce((s, r) => s + r.bill_count, 0);
    return { billed, collected, billCount };
  }, [filteredRows]);

  const raisedByMonth = useMemo(() => {
    const byPeriod = new Map<string, { billed: number; collected: number }>();
    for (const r of filteredRows) {
      const cur = byPeriod.get(r.period) ?? { billed: 0, collected: 0 };
      cur.billed += r.billed;
      cur.collected += r.collected;
      byPeriod.set(r.period, cur);
    }
    return Array.from(byPeriod.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, v]) => ({
        period: shortPeriod(period),
        fullPeriod: formatPeriod(period),
        billed: v.billed,
        collected: v.collected,
        outstanding: v.billed - v.collected,
      }));
  }, [filteredRows]);

  const collectionRate =
    raisedTotals.billed > 0
      ? Math.round((raisedTotals.collected / raisedTotals.billed) * 100)
      : null;

  const lineData = raisedByMonth.map((d) => ({
    period: d.period,
    fullPeriod: d.fullPeriod,
    rate: d.billed > 0 ? Math.round((d.collected / d.billed) * 100) : 0,
  }));

  // ── Empty state ───────────────────────────────────────────────────────────────

  if (payments.length === 0 && rows.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No collection activity for the selected period.
      </p>
    );
  }

  const activeData = view === 'received' ? receivedByMonth : raisedByMonth;
  const hasData = activeData.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* View toggle */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border text-sm">
          <button
            onClick={() => setView('received')}
            className={`px-3 py-1.5 transition-colors first:rounded-l-lg last:rounded-r-lg ${
              view === 'received'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            Payments Received
          </button>
          <button
            onClick={() => setView('raised')}
            className={`px-3 py-1.5 transition-colors first:rounded-l-lg last:rounded-r-lg ${
              view === 'raised'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            Bills Raised
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          {view === 'received'
            ? 'Cash actually received in the selected period'
            : 'Bills issued in the selected period and their collection status'}
        </p>
      </div>

      {/* KPI tiles */}
      {view === 'received' ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Total Received"
            value={formatINR(totalReceived)}
            highlight="green"
            sub={`${paymentCount} payment${paymentCount !== 1 ? 's' : ''}`}
          />
          <KpiTile
            label="Bills Raised (Period)"
            value={formatINR(raisedTotals.billed)}
            sub={`${raisedTotals.billCount} bill${raisedTotals.billCount !== 1 ? 's' : ''}`}
          />
          <KpiTile
            label="Collected on Raised Bills"
            value={formatINR(raisedTotals.collected)}
            // Can exceed "Total Received" — a bill settled from the unit's
            // advance credit counts as collected without cash arriving now.
            sub="incl. advance credit used"
            highlight={
              raisedTotals.billed > 0 &&
              raisedTotals.collected >= raisedTotals.billed
                ? 'green'
                : 'amber'
            }
          />
          <KpiTile
            label="Collection Rate"
            value={collectionRate !== null ? `${collectionRate}%` : '—'}
            highlight={
              collectionRate === null
                ? undefined
                : collectionRate >= 90
                  ? 'green'
                  : collectionRate >= 70
                    ? 'amber'
                    : 'red'
            }
            sub={
              collectionRate === null
                ? 'No bills raised in period'
                : activeBillType
                  ? `Filtered: ${billTypeLabel(activeBillType)}`
                  : 'All bill types'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Total Billed"
            value={formatINR(raisedTotals.billed)}
            sub={`${raisedTotals.billCount} bill${raisedTotals.billCount !== 1 ? 's' : ''}`}
          />
          <KpiTile
            label="Collected"
            value={formatINR(raisedTotals.collected)}
            highlight="green"
          />
          <KpiTile
            label="Outstanding"
            value={formatINR(raisedTotals.billed - raisedTotals.collected)}
            highlight={
              raisedTotals.billed - raisedTotals.collected > 0
                ? 'amber'
                : 'green'
            }
          />
          <KpiTile
            label="Collection Rate"
            value={collectionRate !== null ? `${collectionRate}%` : '—'}
            highlight={
              collectionRate === null
                ? undefined
                : collectionRate >= 90
                  ? 'green'
                  : collectionRate >= 70
                    ? 'amber'
                    : 'red'
            }
            sub={
              activeBillType
                ? `Filtered: ${billTypeLabel(activeBillType)}`
                : 'All bill types'
            }
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Primary bar chart — 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {view === 'received'
                ? 'Monthly Payments Received'
                : 'Monthly Collection'}
            </CardTitle>
            <CardDescription>
              {view === 'received'
                ? `Cash received each month${activeBillType ? ` · ${billTypeLabel(activeBillType)}` : ''}`
                : `Billed vs. collected per month${activeBillType ? ` · ${billTypeLabel(activeBillType)}` : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasData ? (
              <div className="flex h-[260px] items-center justify-center">
                <p className="text-muted-foreground text-sm">
                  {view === 'received'
                    ? 'No payments received in this period.'
                    : 'No bills raised in this period.'}
                </p>
              </div>
            ) : view === 'received' ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={receivedByMonth}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                  />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={inrK}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(val: any) => [
                      formatINR(Number(val)),
                      'Received',
                    ]}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.fullPeriod ?? label
                    }
                    {...TOOLTIP_STYLE}
                  />
                  <Bar
                    dataKey="received"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={raisedByMonth}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                  />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={inrK}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      formatINR(Number(val)),
                      name === 'billed' ? 'Billed' : 'Collected',
                    ]}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.fullPeriod ?? label
                    }
                    {...TOOLTIP_STYLE}
                  />
                  <Legend
                    formatter={(v) => (v === 'billed' ? 'Billed' : 'Collected')}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    dataKey="billed"
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.35}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="collected"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Donut — 1/3 width, always from payments by bill type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Bill Type</CardTitle>
            <CardDescription>
              {donutData.length > 0
                ? 'Payments received by charge type · click to filter'
                : 'No payment data'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {donutData.length === 0 ? (
              <div className="flex h-[180px] items-center justify-center">
                <p className="text-muted-foreground text-sm">No data</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={2}
                      onClick={(entry: any) => {
                        setActiveBillType(
                          activeBillType === entry.key ? null : entry.key,
                        );
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {donutData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.color}
                          opacity={
                            !activeBillType || activeBillType === entry.key
                              ? 1
                              : 0.3
                          }
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [
                        formatINR(Number(val)),
                        'Received',
                      ]}
                      {...TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex w-full flex-col gap-1.5">
                  {donutData.map((d) => (
                    <button
                      key={d.key}
                      onClick={() =>
                        setActiveBillType(
                          activeBillType === d.key ? null : d.key,
                        )
                      }
                      className={`flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${
                        activeBillType === d.key
                          ? 'bg-muted font-semibold'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: d.color }}
                        />
                        {d.name}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatINR(d.value)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Collection rate line — only shown in "Bills Raised" view when there's enough data */}
      {view === 'raised' && lineData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collection Rate Trend</CardTitle>
            <CardDescription>
              % of billed amount collected each month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={lineData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(val: any) => [`${val}%`, 'Collection rate']}
                  labelFormatter={(label, payload) =>
                    payload?.[0]?.payload?.fullPeriod ?? label
                  }
                  {...TOOLTIP_STYLE}
                />
                <Line
                  dataKey={() => 100}
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.25}
                  strokeDasharray="4 4"
                  dot={false}
                  legendType="none"
                />
                <Line
                  dataKey="rate"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
