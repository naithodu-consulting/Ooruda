'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Download, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
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

function download(filename: string, csv: string) {
  // BOM so Excel reads ₹ and names correctly.
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

  const period = `${formatDateReadable(props.range.from)} to ${formatDateReadable(props.range.to)}`;
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

  return (
    <div className="flex max-w-6xl flex-col gap-4 print:max-w-none">
      {/* Print / Save as PDF: the report only, without the app around it. */}
      <style>{`@media print {
        [data-sidebar="sidebar"], [data-slot="sidebar-gap"], header { display: none !important; }
        body { background: #fff !important; }
      }`}</style>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
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
              className="w-full sm:w-56"
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
                Show
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            data-test={'villa-reports-csv'}
          >
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            data-test={'villa-reports-print'}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </div>

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
                'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
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

      <p
        className="text-muted-foreground text-sm"
        data-test={'villa-reports-period'}
      >
        {props.propertyName} · {period}
        {props.range.to > props.today ? ' (includes future bookings)' : ''}
        {props.syncedAt
          ? ` · bookings as of ${new Date(props.syncedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}`
          : ' · bookings are being loaded from the booking site; refresh in a moment'}
      </p>

      {props.tab === 'overview' ? <OverviewTab o={props.overview} /> : null}
      {props.tab === 'channels' ? <ChannelsTab lines={props.channels} /> : null}
      {props.tab === 'guests' && props.guests ? (
        <GuestsTab g={props.guests} />
      ) : null}
    </div>
  );
}

function Tile(props: {
  label: string;
  value: string;
  hint?: string;
  test: string;
}) {
  return (
    <Card className="bg-card" data-test={`villa-report-${props.test}`}>
      <CardContent className="flex flex-col gap-1 px-4 py-3 sm:px-5 sm:py-4">
        <span className="text-muted-foreground text-xs">{props.label}</span>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">
          {props.value}
        </span>
        {props.hint ? (
          <span className="text-muted-foreground text-xs">{props.hint}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ o }: { o: Overview }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          test="occupancy"
          label="Occupancy"
          value={`${o.occupancyPct}%`}
          hint={`${o.bookedNights} of ${o.days} nights`}
        />
        <Tile
          test="revenue"
          label="Revenue"
          value={formatINR(o.revenue)}
          hint={`Before GST · ${o.stays} stay${o.stays === 1 ? '' : 's'}${o.events ? `, ${o.events} event${o.events === 1 ? '' : 's'}` : ''}`}
        />
        <Tile
          test="adr"
          label="Average per night"
          value={formatINR(o.averageNightly)}
          hint="Per booked night"
        />
        <Tile
          test="revpar"
          label="Per available night"
          value={formatINR(o.revenuePerNight)}
          hint="Revenue ÷ all nights"
        />
        <Tile
          test="expenses"
          label="Expenses"
          value={formatINR(o.expenses)}
          hint={`Of which GST ${formatINR(o.expensesGst)}`}
        />
        <Tile
          test="net"
          label="Revenue less expenses"
          value={formatINR(o.net)}
          hint="Before tax"
        />
        <Tile
          test="gst"
          label="GST on stays"
          value={formatINR(o.gstCollected)}
          hint="Collected from guests"
        />
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">
            Revenue and expenses by month
          </CardTitle>
        </CardHeader>
        <CardContent>
          {o.months.length > 0 ? (
            <div className="h-64" data-test={'villa-report-chart'}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={o.months.map((m) => ({
                    ...m,
                    label: monthLabel(m.month),
                  }))}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
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
                    tickFormatter={(v: number) =>
                      v >= 100000
                        ? `${Math.round(v / 1000) / 100}L`
                        : v >= 1000
                          ? `${Math.round(v / 100) / 10}k`
                          : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v) => formatINR(Number(v))}
                    contentStyle={{
                      background: 'var(--popover)',
                      color: 'var(--popover-foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'var(--muted)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="revenue"
                    name="Revenue"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="expenses"
                    name="Expenses"
                    fill="var(--chart-4)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table
              className="w-full min-w-[520px] text-sm"
              data-test={'villa-report-months'}
            >
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Occupancy
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="py-2 pr-3 text-right font-medium">Expenses</th>
                  <th className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {o.months.map((m) => (
                  <tr key={m.month} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">{monthLabel(m.month)}</td>
                    <td className="py-2 pr-3 text-right">
                      {m.occupancyPct}%{' '}
                      <span className="text-muted-foreground text-xs">
                        ({m.nights}/{m.available})
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatINR(m.revenue)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatINR(m.expenses)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right',
                        m.net < 0 && 'text-destructive',
                      )}
                    >
                      {formatINR(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {o.expensesByCategory.length > 0 ? (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Where the money went</CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              className="flex flex-col gap-2"
              data-test={'villa-report-categories'}
            >
              {o.expensesByCategory.map((c) => (
                <li key={c.category} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span>{categoryLabel(c.category)}</span>
                    <span className="tabular-nums">{formatINR(c.amount)}</span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-chart-3 h-full rounded-full"
                      style={{
                        width: `${o.expenses ? (c.amount / o.expenses) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
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
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-base">Where bookings came from</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3" data-test={'villa-report-channels'}>
          {lines.map((c) => (
            <li key={c.channel} className="flex flex-col gap-1">
              <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="font-medium">{channelLabel(c.channel)}</span>
                <span className="tabular-nums">
                  {formatINR(c.revenue)}{' '}
                  <span className="text-muted-foreground text-xs">
                    {c.sharePct}% · {c.stays} stay{c.stays === 1 ? '' : 's'} ·{' '}
                    {c.nights} night{c.nights === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-chart-2 h-full rounded-full"
                  style={{ width: `${c.sharePct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GuestsTab({ g }: { g: GuestsReport }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          test="guests"
          label="Guests who stayed"
          value={String(g.guests)}
        />
        <Tile
          test="returning"
          label="Returning guests"
          value={String(g.returning)}
          hint={`${g.returningPct}% had stayed before`}
        />
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">Returning guests</CardTitle>
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
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[480px] text-sm"
                data-test={'villa-report-guests'}
              >
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Guest</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Stays to date
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Nights to date
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Revenue to date
                    </th>
                    <th className="py-2 text-right font-medium">Last stay</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {g.top.map((x) => (
                    <tr
                      key={`${x.name}-${x.phone}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-2 pr-3">{x.name}</td>
                      <td className="py-2 pr-3 text-right">{x.stays}</td>
                      <td className="py-2 pr-3 text-right">{x.nights}</td>
                      <td className="py-2 pr-3 text-right">
                        {formatINR(x.revenue)}
                      </td>
                      <td className="py-2 text-right">
                        {formatDateReadable(x.lastStay)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Guests are matched by phone number. Stays, nights and revenue count
            every stay at this villa up to the end of the period.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
