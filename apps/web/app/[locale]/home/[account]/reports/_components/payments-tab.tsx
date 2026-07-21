'use client';

import { useMemo, useState } from 'react';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import {
  BILL_TYPE_COLORS,
  BILL_TYPE_LABELS,
  type PaymentRow,
} from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';

interface Props {
  payments: PaymentRow[];
}

const MODE_COLORS: Record<string, string> = {
  UPI: '#6366f1',
  Razorpay: '#8b5cf6',
  NEFT: '#0ea5e9',
  NetBanking: '#06b6d4',
  Cash: '#10b981',
};

const PAGE_SIZE = 25;

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short' });
}

function weekKey(iso: string) {
  const d = new Date(iso);
  // Round down to Monday
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function inrK(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val.toFixed(0)}`;
}

export function PaymentsTab({ payments }: Props) {
  const [page, setPage] = useState(1);

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const count = payments.length;
  const avg = count > 0 ? total / count : 0;

  // Most used mode
  const modeCount = new Map<string, number>();
  for (const p of payments) {
    modeCount.set(p.mode, (modeCount.get(p.mode) ?? 0) + 1);
  }
  const topMode =
    [...modeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  // Timeline data — group by week if range > 2 months, else by day
  const timelineData = useMemo(() => {
    const byKey = new Map<string, number>();
    const rangeMs =
      payments.length > 0
        ? new Date(
            Math.max(...payments.map((p) => new Date(p.paid_at).getTime())),
          ).getTime() -
          new Date(
            Math.min(...payments.map((p) => new Date(p.paid_at).getTime())),
          ).getTime()
        : 0;
    const useWeek = rangeMs > 60 * 24 * 60 * 60 * 1000; // >60 days → weekly
    for (const p of payments) {
      const key = useWeek ? weekKey(p.paid_at) : shortDate(p.paid_at);
      byKey.set(key, (byKey.get(key) ?? 0) + p.amount);
    }
    return Array.from(byKey.entries()).map(([date, amount]) => ({
      date,
      amount,
    }));
  }, [payments]);

  // Mode donut
  const modeData = useMemo(() => {
    const byMode = new Map<string, number>();
    for (const p of payments) {
      byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + p.amount);
    }
    return Array.from(byMode.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([mode, amount]) => ({
        name: mode,
        value: amount,
        color: MODE_COLORS[mode] ?? '#94a3b8',
      }));
  }, [payments]);

  // Stacked bar by bill type per month
  const stackedData = useMemo(() => {
    const byPeriod = new Map<string, Record<string, any>>();
    for (const p of payments) {
      const period = p.paid_at.slice(0, 7); // YYYY-MM
      const cur = byPeriod.get(period) ?? { period };
      cur[p.bill_type] = (cur[p.bill_type] ?? 0) + p.amount;
      byPeriod.set(period, cur);
    }
    return Array.from(byPeriod.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((r) => ({ ...r, label: formatPeriod(r.period) }));
  }, [payments]);

  const billTypesPresent = [
    'maintenance',
    'electricity',
    'other_charges',
    'sinking_fund',
  ].filter((t) => payments.some((p) => p.bill_type === t));

  const totalPages = Math.ceil(payments.length / PAGE_SIZE);
  const paged = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (payments.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No payments recorded in this period.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Total Collected"
          value={formatINR(total)}
          highlight="green"
        />
        <KpiTile label="Payments" value={String(count)} sub="transactions" />
        <KpiTile label="Avg. Payment" value={formatINR(avg)} />
        <KpiTile
          label="Top Mode"
          value={topMode}
          sub={`${modeCount.get(topMode) ?? 0} of ${count} payments`}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Timeline area — 2/3 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment Timeline</CardTitle>
            <CardDescription>Cash flow — when residents pay</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={timelineData}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="payGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
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
                    'Collected',
                  ]}
                  {...TOOLTIP_STYLE}
                />
                <Area
                  dataKey="amount"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#payGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Mode donut — 1/3 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment Mode</CardTitle>
            <CardDescription>Digital adoption breakdown</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={modeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {modeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [formatINR(Number(val)), 'Amount']}
                  {...TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex w-full flex-col gap-1">
              {modeData.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center justify-between px-1 text-xs"
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stacked bar by bill type */}
      {stackedData.length > 1 && billTypesPresent.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Collections by Bill Type
            </CardTitle>
            <CardDescription>
              Monthly payment breakdown across charge types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={stackedData}
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
                  dataKey="label"
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
                  formatter={(val: any, key: any) => [
                    formatINR(Number(val)),
                    BILL_TYPE_LABELS[String(key)] ?? String(key),
                  ]}
                  {...TOOLTIP_STYLE}
                />
                <Legend
                  formatter={(key) => BILL_TYPE_LABELS[key] ?? key}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {billTypesPresent.map((t) => (
                  <Bar
                    key={t}
                    dataKey={t}
                    stackId="a"
                    fill={BILL_TYPE_COLORS[t] ?? '#8b5cf6'}
                    radius={
                      t === billTypesPresent[billTypesPresent.length - 1]
                        ? [4, 4, 0, 0]
                        : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Payment table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payment Log</CardTitle>
          <CardDescription>All payments in this period</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">
                      {formatDateDMY(p.paid_at.slice(0, 10))}
                    </TableCell>
                    <TableCell className="font-medium">{p.unit_no}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {p.bill_no}
                    </TableCell>
                    <TableCell className="text-xs">
                      {BILL_TYPE_LABELS[p.bill_type] ?? p.bill_type}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatINR(p.amount)}
                    </TableCell>
                    <TableCell>
                      <span className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
                        {p.mode}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {p.receipt_no ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="disabled:text-muted-foreground hover:bg-muted rounded px-2 py-1 text-sm disabled:pointer-events-none"
                >
                  ← Prev
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="disabled:text-muted-foreground hover:bg-muted rounded px-2 py-1 text-sm disabled:pointer-events-none"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
