'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Building2,
  ChevronDown,
  Download,
  Globe,
  Printer,
  Star,
  Users,
} from 'lucide-react';
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

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { cn } from '@kit/ui/utils';

import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { channelLabel } from '~/lib/villa/labels';
import {
  type ChannelLine,
  type GuestsReport,
  type Overview,
  REPORT_PRESETS,
  REPORT_PRESET_LABELS,
  type ReportPreset,
  type ReportRange,
  toCsv,
} from '~/lib/villa/reports';

import { EXPENSE_CATEGORY_LABELS } from '../../villa-expenses/_lib/schemas/villa-expenses.schema';

export type ReportTab = 'overview' | 'channels' | 'guests';

const TAB_LABELS: Record<ReportTab, string> = {
  overview: 'Overview',
  channels: 'Channels',
  guests: 'Guests',
};

const monthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

const categoryLabel = (c: string) =>
  EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS] ?? c;

/**
 * Shares as whole percentages that add up to exactly 100, by the largest
 * remainder (Hamilton) method: floor every share, then give the leftover
 * points to the categories that lost the most to rounding.
 *
 * The total is summed here rather than taken from the caller — passing one
 * that did not match these rows is the only way the result could miss 100.
 */
function largestRemainderPct(cats: { category: string; amount: number }[]) {
  const total = cats.reduce((sum, c) => sum + c.amount, 0);

  if (total <= 0) return cats.map((c) => ({ ...c, pct: 0 }));

  const floored = cats.map((c) => {
    const exact = (c.amount / total) * 100;
    const pct = Math.floor(exact);
    return { ...c, pct, rem: exact - pct };
  });

  const leftover = 100 - floored.reduce((sum, c) => sum + c.pct, 0);
  const byRemainder = [...floored].sort((a, b) => b.rem - a.rem);

  byRemainder.forEach((c, i) => {
    if (i < leftover) c.pct += 1;
  });

  return floored;
}

// Pie chart colors using CSS variable chart tokens
const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function download(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsView(props: {
  account: string;
  tab: ReportTab;
  range: ReportRange;
  today: string;
  propertyName: string;
  propertyId: string | null;
  syncedAt: string | null;
  overview: Overview;
  channels: ChannelLine[];
  guests: GuestsReport | null;
}) {
  const router = useRouter();
  const base = `/home/${props.account}/villa-reports`;

  const href = (over: {
    tab?: ReportTab;
    range?: ReportPreset;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    const range = over.range ?? props.range.preset;
    q.set('tab', over.tab ?? props.tab);
    q.set('range', range);
    if (range === 'custom') {
      q.set('from', over.from ?? props.range.from);
      q.set('to', over.to ?? props.range.to);
    }
    if (props.propertyId) q.set('property', props.propertyId);
    return `${base}?${q.toString()}`;
  };

  const [customFrom, setCustomFrom] = useState(props.range.from);
  const [customTo, setCustomTo] = useState(props.range.to);

  const period = `${formatDateReadable(props.range.from)} – ${formatDateReadable(props.range.to)}`;
  const fileStem = `${props.propertyName.replace(/[^\w-]+/g, '-')}-${props.range.from}-to-${props.range.to}`;

  function exportCsv() {
    const o = props.overview;

    if (props.tab === 'channels') {
      download(
        `${fileStem}-channels.csv`,
        toCsv([
          ['Channel', 'Stays', 'Nights', 'Revenue before GST (INR)', 'Share %'],
          ...props.channels.map((c) => [
            channelLabel(c.channel),
            c.stays,
            c.nights,
            c.revenue,
            c.sharePct,
          ]),
        ]),
      );
      return;
    }

    if (props.tab === 'guests' && props.guests) {
      download(
        `${fileStem}-returning-guests.csv`,
        toCsv([
          [
            'Guest',
            'Phone',
            'Stays to date',
            'Nights to date',
            'Revenue before GST to date (INR)',
            'Last stay',
          ],
          ...props.guests.top.map((g) => [
            g.name,
            g.phone,
            g.stays,
            g.nights,
            g.revenue,
            g.lastStay,
          ]),
        ]),
      );
      return;
    }

    download(
      `${fileStem}-overview.csv`,
      toCsv([
        [
          'Month',
          'Nights booked',
          'Nights available',
          'Occupancy %',
          'Revenue before GST (INR)',
          'Expenses (INR)',
          'Net (INR)',
        ],
        ...o.months.map((m) => [
          m.month,
          m.nights,
          m.available,
          m.occupancyPct,
          m.revenue,
          m.expenses,
          m.net,
        ]),
        [
          'Total',
          o.bookedNights,
          o.days,
          o.occupancyPct,
          o.revenue,
          o.expenses,
          o.net,
        ],
      ]),
    );
  }

  const syncLabel = props.syncedAt
    ? (() => {
        const d = new Date(props.syncedAt);
        return d.toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata',
        });
      })()
    : null;

  return (
    <div className="flex max-w-6xl flex-col gap-5 print:max-w-none">
      <style>{`@media print {
        [data-sidebar="sidebar"], [data-slot="sidebar-gap"], header { display: none !important; }
        body { background: #fff !important; }
      }`}</style>

      {/* ── Controls bar ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
        {/* Period selector + custom pickers */}
        <div className="flex flex-wrap items-end gap-2">
          <Select
            value={props.range.preset}
            onValueChange={(v) => {
              if (v && v !== 'custom')
                router.push(href({ range: v as ReportPreset }));
              if (v === 'custom')
                router.push(
                  href({ range: 'custom', from: customFrom, to: customTo }),
                );
            }}
          >
            <SelectTrigger
              className="h-9 w-48"
              aria-label="Period"
              data-test={'villa-reports-range'}
            >
              <SelectValue>
                {(v: string) => REPORT_PRESET_LABELS[v as ReportPreset] ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {REPORT_PRESETS.map((p) => (
                <SelectItem
                  key={p}
                  value={p}
                  data-test={`villa-reports-range-${p}`}
                >
                  {REPORT_PRESET_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {props.range.preset === 'custom' ? (
            <div className="flex flex-wrap items-end gap-2">
              <DatePicker
                value={customFrom}
                onChange={(v) => v && setCustomFrom(v)}
                max={customTo}
                data-test={'villa-reports-from'}
              />
              <DatePicker
                value={customTo}
                onChange={(v) => v && setCustomTo(v)}
                min={customFrom}
                data-test={'villa-reports-to'}
              />
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    href={href({
                      range: 'custom',
                      from: customFrom,
                      to: customTo,
                    })}
                  />
                }
                data-test={'villa-reports-apply'}
              >
                Apply
              </Button>
            </div>
          ) : null}
        </div>

        {/* Export + print */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                data-test={'villa-reports-export'}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={exportCsv}
              data-test={'villa-reports-csv'}
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.print()}
              data-test={'villa-reports-print'}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print / Save as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
        <nav
          aria-label="Report"
          className="bg-muted inline-flex w-max min-w-max rounded-lg p-1"
        >
          {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
            <Link
              key={t}
              href={href({ tab: t })}
              scroll={false}
              aria-current={props.tab === t ? 'page' : undefined}
              data-test={`villa-reports-tab-${t}`}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                props.tab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[t]}
            </Link>
          ))}
        </nav>
      </div>

      {/* ── Period subtitle ──────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
        data-test={'villa-reports-period'}
      >
        <span className="text-muted-foreground text-sm font-medium">
          {period}
        </span>
        {props.range.to > props.today ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
            includes future bookings
          </span>
        ) : null}
        {syncLabel ? (
          <span className="text-muted-foreground text-xs">
            · synced {syncLabel}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            · loading bookings from site…
          </span>
        )}
      </div>

      {props.range.invalid ? (
        <p
          className="text-warning text-sm print:hidden"
          role="status"
          data-test={'villa-reports-invalid-range'}
        >
          That custom period was not valid (the end must be after the start, and
          at most 3 years apart). Showing this month instead.
        </p>
      ) : null}

      {/* ── Tab content ──────────────────────────────────────── */}
      {props.tab === 'overview' ? <OverviewTab o={props.overview} /> : null}
      {props.tab === 'channels' ? <ChannelsTab lines={props.channels} /> : null}
      {props.tab === 'guests' && props.guests ? (
        <GuestsTab g={props.guests} />
      ) : null}
    </div>
  );
}

// ── Hero tile (large number) ─────────────────────────────────────────────────

function HeroTile(props: {
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  test: string;
  accent?: string;
}) {
  return (
    <Card
      className={cn('bg-card', props.accent)}
      data-test={`villa-report-${props.test}`}
    >
      <CardContent className="flex flex-col gap-1.5 px-4 py-4 sm:px-5 sm:py-5">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {props.label}
        </span>
        <span className="text-2xl font-bold tabular-nums sm:text-3xl">
          {props.value}
        </span>
        {props.hint ? (
          <span className="text-muted-foreground text-xs">{props.hint}</span>
        ) : null}
        {props.sub ? (
          <span className="text-muted-foreground text-xs">{props.sub}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Small stat tile ───────────────────────────────────────────────────────────

function StatTile(props: {
  label: string;
  value: string;
  hint?: string;
  test: string;
}) {
  return (
    <Card className="bg-card" data-test={`villa-report-${props.test}`}>
      <CardContent className="flex flex-col gap-1 px-4 py-3 sm:px-4 sm:py-3.5">
        <span className="text-muted-foreground text-xs">{props.label}</span>
        <span className="text-lg font-semibold tabular-nums">
          {props.value}
        </span>
        {props.hint ? (
          <span className="text-muted-foreground text-xs">{props.hint}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ o }: { o: Overview }) {
  const hasMonths = o.months.length > 0;

  return (
    <>
      {/* Hero KPIs — what owners scan for every time */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HeroTile
          test="revenue"
          label="Revenue"
          value={formatINR(o.revenue)}
          hint={`Before GST · ${o.stays} stay${o.stays === 1 ? '' : 's'}${o.events ? `, ${o.events} event${o.events === 1 ? '' : 's'}` : ''}`}
        />
        <HeroTile
          test="occupancy"
          label="Occupancy"
          value={`${o.occupancyPct}%`}
          hint={`${o.bookedNights} of ${o.days} nights booked`}
        />
        <HeroTile
          test="net"
          label="Net income"
          value={formatINR(o.net)}
          hint="Revenue less expenses, before tax"
          accent={o.net < 0 ? 'border-destructive/30' : undefined}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          test="adr"
          label="Avg. per booked night"
          value={formatINR(o.averageNightly)}
          hint="ADR"
        />
        <StatTile
          test="revpar"
          label="Revenue per night"
          value={formatINR(o.revenuePerNight)}
          hint="RevPAR"
        />
        <StatTile
          test="expenses"
          label="Expenses"
          value={formatINR(o.expenses)}
          hint={`GST on expenses: ${formatINR(o.expensesGst)}`}
        />
        <StatTile
          test="gst"
          label="GST collected"
          value={formatINR(o.gstCollected)}
          hint="From guests on stays"
        />
      </div>

      {/* Revenue + expenses chart */}
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Revenue vs expenses by month
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasMonths ? (
            <div className="h-72" data-test={'villa-report-chart'}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={o.months.map((m) => ({
                    ...m,
                    label: monthLabel(m.month),
                  }))}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  barGap={4}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={60}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v >= 100000
                        ? `${Math.round(v / 1000) / 100}L`
                        : v >= 1000
                          ? `${Math.round(v / 100) / 10}k`
                          : String(v)
                    }
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
                    contentStyle={{
                      background: 'var(--popover)',
                      color: 'var(--popover-foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'var(--muted)' }}
                  />
                  <Legend
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
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="expenses"
                    name="expenses"
                    fill="var(--chart-4)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Occupancy trend line — only meaningful with 2+ months */}
          {hasMonths && o.months.length >= 2 ? (
            <div className="mt-4 h-28" data-test={'villa-report-occ-chart'}>
              <p className="text-muted-foreground mb-1 text-xs font-medium">
                Occupancy % by month
              </p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={o.months.map((m) => ({
                    label: monthLabel(m.month),
                    occupancy: m.occupancyPct,
                  }))}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={36}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, 'Occupancy']}
                    contentStyle={{
                      background: 'var(--popover)',
                      color: 'var(--popover-foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="occupancy"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Month breakdown table */}
          <div className="mt-5 overflow-x-auto">
            <table
              className="w-full min-w-[560px] text-sm"
              data-test={'villa-report-months'}
            >
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-2 pr-4 font-medium">Month</th>
                  <th className="py-2 pr-4 text-right font-medium">Nights</th>
                  <th className="py-2 pr-4 text-right font-medium">Occ %</th>
                  <th className="py-2 pr-4 text-right font-medium">Revenue</th>
                  <th className="py-2 pr-4 text-right font-medium">Expenses</th>
                  <th className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {o.months.map((m) => (
                  <tr key={m.month} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">
                      {monthLabel(m.month)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {m.nights}
                      <span className="text-muted-foreground">
                        /{m.available}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right">{m.occupancyPct}%</td>
                    <td className="py-2 pr-4 text-right">
                      {formatINR(m.revenue)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {m.expenses > 0 ? formatINR(m.expenses) : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right font-medium',
                        m.net < 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {formatINR(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {o.months.length > 1 ? (
                <tfoot>
                  <tr className="border-t-2">
                    <td className="py-2 pr-4 text-xs font-semibold tracking-wide uppercase">
                      Total
                    </td>
                    <td className="py-2 pr-4 text-right text-xs font-semibold">
                      {o.bookedNights}
                      <span className="text-muted-foreground">/{o.days}</span>
                    </td>
                    <td className="py-2 pr-4 text-right text-xs font-semibold">
                      {o.occupancyPct}%
                    </td>
                    <td className="py-2 pr-4 text-right text-xs font-semibold">
                      {formatINR(o.revenue)}
                    </td>
                    <td className="py-2 pr-4 text-right text-xs font-semibold">
                      {o.expenses > 0 ? formatINR(o.expenses) : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right text-xs font-semibold',
                        o.net < 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {formatINR(o.net)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Expense breakdown */}
      {o.expensesByCategory.length > 0 ? (
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Where the money went</CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              className="flex flex-col gap-3"
              data-test={'villa-report-categories'}
            >
              {largestRemainderPct(o.expensesByCategory).map(
                ({ category, amount, pct }) => (
                  <li key={category} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{categoryLabel(category)}</span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted-foreground text-xs">
                          {pct}%
                        </span>
                        <span className="font-medium">{formatINR(amount)}</span>
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-chart-3 h-full rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                ),
              )}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

// ── Channels tab ─────────────────────────────────────────────────────────────

function channelIcon(channel: string) {
  if (channel === 'airbnb')
    return <Building2 className="h-4 w-4 shrink-0" aria-hidden />;
  if (channel === 'online' || channel === 'website')
    return <Globe className="h-4 w-4 shrink-0" aria-hidden />;
  return <Star className="h-4 w-4 shrink-0" aria-hidden />;
}

function ChannelsTab({ lines }: { lines: ChannelLine[] }) {
  if (lines.length === 0) {
    return (
      <Card className="bg-card">
        <CardContent
          className="text-muted-foreground py-10 text-center text-sm"
          data-test={'villa-report-channels-empty'}
        >
          No stays in this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Donut chart + summary cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Donut — only meaningful with 2+ channels */}
        {lines.length >= 2 ? (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue share</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56" data-test={'villa-report-channel-chart'}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={lines.map((c) => ({
                        name: channelLabel(c.channel),
                        value: c.revenue,
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="72%"
                      paddingAngle={3}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {lines.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [formatINR(Number(v)), 'Revenue']}
                      contentStyle={{
                        background: 'var(--popover)',
                        color: 'var(--popover-foreground)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Channel summary cards */}
        <div className="flex flex-col gap-3">
          {lines.map((c) => (
            <Card
              key={c.channel}
              className="bg-card"
              data-test={'villa-report-channel-card'}
            >
              <CardContent className="flex items-start gap-3 px-4 py-3">
                <div className="bg-muted text-muted-foreground mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  {channelIcon(c.channel)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {channelLabel(c.channel)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(c.revenue)}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs tabular-nums">
                    <span>{c.sharePct}% of revenue</span>
                    <span>
                      {c.stays} stay{c.stays === 1 ? '' : 's'}
                    </span>
                    <span>
                      {c.nights} night{c.nights === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-chart-2 h-full rounded-full"
                      style={{ width: `${c.sharePct}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail table */}
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where bookings came from</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[420px] text-sm"
              data-test={'villa-report-channels'}
            >
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-2 pr-4 font-medium">Channel</th>
                  <th className="py-2 pr-4 text-right font-medium">Stays</th>
                  <th className="py-2 pr-4 text-right font-medium">Nights</th>
                  <th className="py-2 pr-4 text-right font-medium">Revenue</th>
                  <th className="py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lines.map((c) => (
                  <tr key={c.channel} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">
                      {channelLabel(c.channel)}
                    </td>
                    <td className="py-2 pr-4 text-right">{c.stays}</td>
                    <td className="py-2 pr-4 text-right">{c.nights}</td>
                    <td className="py-2 pr-4 text-right">
                      {formatINR(c.revenue)}
                    </td>
                    <td className="py-2 text-right">{c.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Guests tab ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function GuestsTab({ g }: { g: GuestsReport }) {
  const newGuests = g.guests - g.returning;

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          test="guests"
          label="Unique guests"
          value={String(g.guests)}
          hint="Matched by phone"
        />
        <StatTile
          test="new-guests"
          label="New guests"
          value={String(newGuests)}
          hint="First time at this villa"
        />
        <StatTile
          test="returning"
          label="Returning guests"
          value={String(g.returning)}
          hint={`${g.returningPct}% had stayed before`}
        />
      </div>

      {/* Returning guests list */}
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="text-muted-foreground h-4 w-4" />
            Returning guests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {g.top.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-test={'villa-report-guests-empty'}
            >
              No returning guests in this period yet.
            </p>
          ) : (
            <div
              className="flex flex-col divide-y"
              data-test={'villa-report-guests'}
            >
              {g.top.map((x) => {
                const lastStayDate = new Date(`${x.lastStay}T00:00:00Z`);
                const lastStayLabel = lastStayDate.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                });
                return (
                  <div
                    key={`${x.name}-${x.phone}`}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {/* Avatar */}
                    <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {initials(x.name)}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{x.name}</span>
                        <span className="font-semibold tabular-nums">
                          {formatINR(x.revenue)}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums">
                        <span>
                          {x.stays} stay{x.stays === 1 ? '' : 's'}
                        </span>
                        <span>
                          {x.nights} night{x.nights === 1 ? '' : 's'}
                        </span>
                        <span>Last: {lastStayLabel}</span>
                      </div>
                    </div>
                    {/* Repeat badge */}
                    <div className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                      ×{x.stays}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-muted-foreground mt-4 border-t pt-3 text-xs">
            Guests with the same phone number are counted as one person. Stays,
            nights and revenue include every visit to this villa, not just this
            period.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
