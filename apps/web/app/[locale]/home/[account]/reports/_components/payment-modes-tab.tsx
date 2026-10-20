'use client';

import { useMemo } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

import { formatINR } from '~/lib/format-inr';

import type { PaymentModeRow } from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  rows: PaymentModeRow[];
}

const MODE_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#0ea5e9',
  '#f97316',
  '#14b8a6',
];

function inrK(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val.toFixed(0)}`;
}

export function PaymentModesTab({ rows }: Props) {
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalCount = useMemo(
    () => rows.reduce((s, r) => s + r.count, 0),
    [rows],
  );
  const topMode = rows[0];

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No payment data for the selected period.
      </p>
    );
  }

  const {
    page,
    setPage,
    paged,
    totalPages,
    total: pagedTotal,
    fromIndex,
    toIndex,
  } = usePagedRows(rows, null);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <KpiTile label="Total Collected" value={formatINR(total)} />
        <KpiTile label="Total Transactions" value={String(totalCount)} />
        <KpiTile
          label="Top Mode"
          value={topMode?.mode ?? '-'}
          sub={
            topMode
              ? `${((topMode.amount / total) * 100).toFixed(1)}% of total`
              : ''
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment Share by Mode</CardTitle>
            <CardDescription>% of total amount collected</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="mode"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={(entry: any) =>
                    `${entry.mode} ${(((entry.percent as number | undefined) ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {rows.map((_, i) => (
                    <Cell
                      key={i}
                      fill={MODE_COLORS[i % MODE_COLORS.length]}
                      fillOpacity={0.85}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, _: any, entry: any) => [
                    `${formatINR(val)} (${((val / total) * 100).toFixed(1)}%)`,
                    entry.payload.mode,
                  ]}
                  {...TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Amount by Payment Mode</CardTitle>
            <CardDescription>₹ collected per mode</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  type="number"
                  tickFormatter={inrK}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="mode"
                  type="category"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(val: any) => [formatINR(val), 'Amount']}
                  {...TOOLTIP_STYLE}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {rows.map((_, i) => (
                    <Cell
                      key={i}
                      fill={MODE_COLORS[i % MODE_COLORS.length]}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payment Mode</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead className="text-right">Share (%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((r, i) => (
              <TableRow key={r.mode}>
                <TableCell>
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      background: MODE_COLORS[i % MODE_COLORS.length],
                    }}
                  />
                  {r.mode}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.count.toLocaleString('en-IN')}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatINR(r.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {total > 0 ? ((r.amount / total) * 100).toFixed(1) : '0.0'}%
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {totalCount.toLocaleString('en-IN')}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatINR(total)}
              </TableCell>
              <TableCell className="text-right">100%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <TablePagination
        page={page}
        totalPages={totalPages}
        total={pagedTotal}
        fromIndex={fromIndex}
        toIndex={toIndex}
        onPageChange={setPage}
        label="modes"
        testPrefix="payment-modes"
      />
    </div>
  );
}
