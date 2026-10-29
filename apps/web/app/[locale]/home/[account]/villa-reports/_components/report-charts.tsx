'use client';

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

import { formatINR } from '~/lib/format-inr';

/**
 * Every Recharts graph on the Reports screen, in its own module.
 *
 * Recharts is by far the largest dependency of this screen, and four of the
 * six report tabs draw no graph at all. Keeping the charts here lets
 * reports-view load them on demand (see the `dynamic()` calls there), so the
 * tables and figures become interactive without waiting for the chart library
 * to arrive and parse.
 */

const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const TOOLTIP_STYLE = {
  contentStyle: {
    fontSize: 12,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--popover)',
    color: 'var(--popover-foreground)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '8px 12px',
  } as React.CSSProperties,
  labelStyle: {
    fontWeight: 700,
    fontSize: 12,
    color: 'var(--popover-foreground)',
    marginBottom: 4,
  } as React.CSSProperties,
  itemStyle: {
    fontSize: 12,
    color: 'var(--popover-foreground)',
    padding: '1px 0',
    fontWeight: 500,
  } as React.CSSProperties,
};

function inrK(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val.toFixed(0)}`;
}

export interface MonthPoint {
  label: string;
  fullPeriod: string;
  revenue: number;
  expenses: number;
}

/** Taxable stay revenue against operating expenses, per month. */
export function RevenueExpensesChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
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
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          width={56}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={inrK}
        />
        <Tooltip
          formatter={(v, name) => [
            formatINR(Number(v)),
            name === 'revenue'
              ? 'Revenue'
              : name === 'expenses'
                ? 'Expenses'
                : String(name),
          ]}
          labelFormatter={(label, payload) =>
            payload?.[0]?.payload?.fullPeriod ?? label
          }
          {...TOOLTIP_STYLE}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) =>
            value === 'revenue'
              ? 'Revenue'
              : value === 'expenses'
                ? 'Expenses'
                : value
          }
        />
        <Bar
          isAnimationActive={false}
          dataKey="revenue"
          name="revenue"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
        <Bar
          isAnimationActive={false}
          dataKey="expenses"
          name="expenses"
          fill="var(--chart-4)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface OccupancyPoint {
  label: string;
  fullPeriod: string;
  occupancy: number;
}

/** Percentage of available nights sold each month. */
export function OccupancyTrendChart({ data }: { data: OccupancyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          width={40}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip
          formatter={(v) => [`${v}%`, 'Occupancy']}
          labelFormatter={(label, payload) =>
            payload?.[0]?.payload?.fullPeriod ?? label
          }
          {...TOOLTIP_STYLE}
        />
        <Line
          type="monotone"
          dataKey="occupancy"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface DonutSlice {
  /** Legend and tooltip name. */
  name: string;
  value: number;
  /** Stable React key; the index is used when a row has no natural one. */
  key?: string;
}

/**
 * The expense-category, payment-mode and booking-channel breakdowns, which are
 * the same donut with different data. `scale: 'relative'` is the Channels
 * variant, whose radii follow the (shorter) card rather than fixed pixels.
 */
export function DonutChart({
  slices,
  tooltipLabel,
  scale = 'fixed',
}: {
  slices: DonutSlice[];
  tooltipLabel: string;
  scale?: 'fixed' | 'relative';
}) {
  const relative = scale === 'relative';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          cx="50%"
          cy="50%"
          innerRadius={relative ? '52%' : 56}
          outerRadius={relative ? '75%' : 90}
          paddingAngle={relative ? 3 : 2}
          dataKey="value"
          isAnimationActive={false}
        >
          {slices.map((s, i) => (
            <Cell
              key={s.key ?? `${s.name}-${i}`}
              fill={PIE_COLORS[i % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => [formatINR(Number(v)), tooltipLabel]}
          {...TOOLTIP_STYLE}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
