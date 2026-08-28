'use client';

import { useMemo, useState } from 'react';

import { ChevronDown, ChevronUp } from 'lucide-react';
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

import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  billOutstanding,
  billSettledAmount,
  billStatusBadgeClassName,
  displayBillStatus,
} from '~/lib/bill-status';
import { formatDateDMY, formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import {
  billTypeLabel,
  type OutstandingBill,
  type OutstandingStatus,
} from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  bills: OutstandingBill[];
  statusFilter: OutstandingStatus;
}

const AGEING_BUCKETS = [
  { key: 'current', label: 'Current', color: '#10b981' },
  { key: 'd1_7', label: '1–7 days', color: '#f59e0b' },
  { key: 'd8_30', label: '8–30 days', color: '#f97316' },
  { key: 'd30plus', label: '30+ days', color: '#ef4444' },
];

function ageingBucket(dueDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diffMs = today.getTime() - due.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'current';
  if (days <= 7) return 'd1_7';
  if (days <= 30) return 'd8_30';
  return 'd30plus';
}

function daysOverdue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

export function OutstandingTab({ bills, statusFilter }: Props) {
  const [showTable, setShowTable] = useState(false);
  const [search, setSearch] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute per-bill outstanding amount and ageing
  const enrichedAll = useMemo(
    () =>
      bills.map((b) => ({
        ...b,
        outstanding: billOutstanding(b),
        settled: billSettledAmount(b),
        bucket: ageingBucket(b.due_date),
        days: daysOverdue(b.due_date),
        statusDisplay: displayBillStatus(b),
      })),
    [bills],
  );

  // Apply status filter client-side (server already filtered by unit/bill_type)
  const enriched = useMemo(() => {
    if (statusFilter === 'overdue')
      return enrichedAll.filter((b) => b.days > 0);
    // "Partial" / "Unpaid" are about how much has been settled — advance credit
    // counts as settlement just like a payment does.
    if (statusFilter === 'partial')
      return enrichedAll.filter((b) => b.settled > 0);
    if (statusFilter === 'unpaid')
      return enrichedAll.filter((b) => b.settled === 0);
    return enrichedAll;
  }, [enrichedAll, statusFilter]);

  const totalOutstanding = enriched.reduce((s, b) => s + b.outstanding, 0);
  const overdueCount = enriched.filter((b) => b.days > 0).length;
  const oldestDue = enriched
    .filter((b) => b.outstanding > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date;

  // Ageing chart data
  const ageingData = useMemo(() => {
    const map: Record<string, number> = {
      current: 0,
      d1_7: 0,
      d8_30: 0,
      d30plus: 0,
    };
    for (const b of enriched)
      map[b.bucket] = (map[b.bucket] ?? 0) + b.outstanding;
    return AGEING_BUCKETS.map((bkt) => ({
      ...bkt,
      amount: map[bkt.key] ?? 0,
    })).filter((bkt) => bkt.amount > 0);
  }, [enriched]);

  // Top-10 defaulters
  const topDefaulters = useMemo(() => {
    const byUnit = new Map<string, number>();
    for (const b of enriched) {
      byUnit.set(b.unit_no, (byUnit.get(b.unit_no) ?? 0) + b.outstanding);
    }
    return Array.from(byUnit.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([unit_no, amount]) => ({ unit_no, amount }));
  }, [enriched]);

  // Filtered table
  const filtered = useMemo(
    () =>
      enriched.filter(
        (b) =>
          !search ||
          b.unit_no.toLowerCase().includes(search.toLowerCase()) ||
          b.bill_no.toLowerCase().includes(search.toLowerCase()),
      ),
    [enriched, search],
  );
  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, `${statusFilter}|${search}`);

  const inrK = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
    return `₹${val.toFixed(0)}`;
  };

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16">
        <p className="text-lg font-semibold">All clear!</p>
        <p className="text-muted-foreground text-sm">
          No outstanding dues in this period.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <KpiTile
          label="Total Outstanding"
          value={formatINR(totalOutstanding)}
          highlight="amber"
          sub={`${bills.length} unpaid bill${bills.length !== 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Overdue Bills"
          value={String(overdueCount)}
          highlight={overdueCount > 0 ? 'red' : 'green'}
          sub={overdueCount > 0 ? 'Past due date' : 'None past due'}
        />
        <KpiTile
          label="Oldest Unpaid"
          value={oldestDue ? formatDateReadable(oldestDue) : '—'}
          highlight={oldestDue ? 'red' : undefined}
          sub="Earliest unpaid due date"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ageing buckets */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overdue by Age</CardTitle>
            <CardDescription>
              Outstanding amount by how long it's been overdue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer
              width="100%"
              height={Math.max(100, ageingData.length * 64)}
            >
              <BarChart
                data={ageingData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                barSize={32}
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
                  dataKey="label"
                  type="category"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <Tooltip
                  formatter={(val: any) => [
                    formatINR(Number(val)),
                    'Outstanding',
                  ]}
                  allowEscapeViewBox={{ x: false, y: true }}
                  {...TOOLTIP_STYLE}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {ageingData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top defaulters */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Highest Outstanding</CardTitle>
            <CardDescription>
              Units with the most unpaid balance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={topDefaulters}
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
                  dataKey="unit_no"
                  type="category"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(val: any) => [
                    formatINR(Number(val)),
                    'Outstanding',
                  ]}
                  {...TOOLTIP_STYLE}
                />
                <Bar dataKey="amount" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Expandable full table */}
      <Card>
        <CardHeader className="pb-2">
          <button
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowTable((v) => !v)}
          >
            <div>
              <CardTitle className="text-base">All Outstanding Bills</CardTitle>
              <CardDescription>
                {filtered.length} bill{filtered.length !== 1 ? 's' : ''} · click
                to {showTable ? 'collapse' : 'expand'}
              </CardDescription>
            </div>
            {showTable ? (
              <ChevronUp className="text-muted-foreground h-4 w-4" />
            ) : (
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            )}
          </button>
        </CardHeader>

        {showTable && (
          <CardContent className="flex flex-col gap-3">
            <Input
              placeholder="Search unit or bill no…"
              className="h-8 max-w-xs text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Bill No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Overdue (days)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.unit_no}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {b.bill_no}
                      </TableCell>
                      <TableCell className="text-xs">
                        {billTypeLabel(b.bill_type)}
                      </TableCell>
                      <TableCell>{formatPeriod(b.period)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatINR(b.outstanding)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={billStatusBadgeClassName(b.statusDisplay)}
                        >
                          {b.statusDisplay}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateDMY(b.due_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.days > 0 ? (
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {b.days}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              fromIndex={fromIndex}
              toIndex={toIndex}
              onPageChange={setPage}
              label="bills"
              testPrefix="outstanding"
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
