'use client';

import { useMemo } from 'react';

import {
  Area,
  AreaChart,
  CartesianGrid,
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

import { billTypeLabel, type CashLedgerRow } from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';

interface Props {
  rows: CashLedgerRow[];
}

function inrK(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val.toFixed(0)}`;
}

function shortDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  due_payment: 'Payment received',
  advance_applied: 'Advance used',
  advance_received: 'Advance received',
  advance_refund: 'Advance refund',
  other: 'Other',
};

export function CashLedgerTab({ rows }: Props) {
  const credits = rows.filter((r) => r.direction === 'credit');
  const debits = rows.filter((r) => r.direction === 'debit');

  const totalCredits = credits.reduce((s, r) => s + r.amount, 0);
  const totalDebits = debits.reduce((s, r) => s + r.amount, 0);
  const net = totalCredits - totalDebits;

  // Monthly area chart: credits vs debits
  const monthlyData = useMemo(() => {
    const map = new Map<string, { credits: number; debits: number }>();
    for (const r of rows) {
      const month = r.entry_date.slice(0, 7);
      const cur = map.get(month) ?? { credits: 0, debits: 0 };
      if (r.direction === 'credit') cur.credits += r.amount;
      else cur.debits += r.amount;
      map.set(month, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month: shortDate(month),
        fullMonth: month,
        ...v,
      }));
  }, [rows]);

  // Bill type breakdown
  const byBillType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of credits) {
      map.set(r.bill_type, (map.get(r.bill_type) ?? 0) + r.amount);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, amount]) => ({ type, amount }));
  }, [credits]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16">
        <p className="text-lg font-semibold">No transactions found</p>
        <p className="text-muted-foreground text-sm">
          No records found for the selected period and filters.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Total Received"
          value={formatINR(totalCredits)}
          highlight="green"
          sub={`${credits.length} transaction${credits.length !== 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Total Debits"
          value={formatINR(totalDebits)}
          highlight={totalDebits > 0 ? 'amber' : undefined}
          sub={`${debits.length} transaction${debits.length !== 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Net Balance"
          value={formatINR(Math.abs(net))}
          highlight={net >= 0 ? 'green' : 'red'}
          sub={net >= 0 ? 'Net credit' : 'Net debit'}
        />
        <KpiTile
          label="Total Transactions"
          value={String(rows.length)}
          sub="across all types"
        />
      </div>

      {/* Area chart */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Cash Flow</CardTitle>
            <CardDescription>Credits vs. debits by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={monthlyData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="clCredits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="clDebits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="month"
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
                    name === 'credits' ? 'Credits' : 'Debits',
                  ]}
                  {...TOOLTIP_STYLE}
                />
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#clCredits)"
                />
                <Area
                  type="monotone"
                  dataKey="debits"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#clDebits)"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Credits
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                Debits
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bill type breakdown */}
      {byBillType.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Received by Charge Type</CardTitle>
            <CardDescription>
              Amount received per charge type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {byBillType.map(({ type, amount }) => {
                const pct =
                  totalCredits > 0 ? (amount / totalCredits) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-28 shrink-0 text-xs font-medium">
                      {billTypeLabel(type)}
                    </div>
                    <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-24 shrink-0 text-right text-xs tabular-nums">
                      {formatINR(amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Transactions</CardTitle>
          <CardDescription>
            {rows.length} transaction{rows.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Charge</TableHead>
                  <TableHead>Paid By</TableHead>
                  <TableHead>In / Out</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs tabular-nums">
                      {formatDateDMY(r.entry_date)}
                    </TableCell>
                    <TableCell className="font-medium">{r.unit_no}</TableCell>
                    <TableCell className="text-xs">
                      {ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type}
                    </TableCell>
                    <TableCell className="text-xs">
                      {billTypeLabel(r.bill_type)}
                    </TableCell>
                    <TableCell className="text-xs">{r.paid_by_name}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-semibold ${
                          r.direction === 'credit'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {r.direction === 'credit' ? '↑' : '↓'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatINR(r.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate text-xs">
                      {r.notes ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
