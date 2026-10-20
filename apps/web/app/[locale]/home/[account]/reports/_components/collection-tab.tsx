'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

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

import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { downloadCsvAction, downloadPdfAction } from '../_lib/reports-actions';
import {
  billTypeLabel,
  BILL_TYPE_COLORS,
  type BillTypeUnitRow,
  type CollectionRow,
  dateToPeriod,
  type PaymentRow,
} from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  associationId: string;
  from: string;
  to: string;
  unitIds: string[];
  rows: CollectionRow[]; // bills grouped by bill period
  payments: PaymentRow[]; // payments grouped by paid_at date
}

const STATUS_BADGE: Record<
  BillTypeUnitRow['status'],
  { label: string; className: string }
> = {
  paid: {
    label: 'Paid',
    className: 'border-green-200 bg-green-50 text-success',
  },
  partial: {
    label: 'Partial',
    className: 'border-amber-200 bg-amber-50 text-warning',
  },
  unpaid: {
    label: 'Unpaid',
    className: 'border-red-200 bg-red-50 text-destructive',
  },
  overdue: {
    label: 'Overdue',
    className: 'border-red-200 bg-red-100 text-destructive',
  },
};

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

export function CollectionTab({
  associationId,
  from,
  to,
  unitIds,
  rows,
  payments,
  onViewChange,
}: Props & { onViewChange?: (v: View) => void }) {
  // Default to "Payments Received" (payment-date-based) so
  // "This FY" always shows money that actually came in.
  const [view, setView] = useState<View>('received');
  const handleViewChange = (v: View) => {
    setView(v);
    onViewChange?.(v);
  };
  const [activeBillType, setActiveBillType] = useState<string | null>(null);

  // Unit-level breakdown for the selected bill type - fetched lazily when the
  // user clicks a donut slice. Mirrors the former "By Bill Type" tab logic.
  const [unitBreakdownRows, setUnitBreakdownRows] = useState<BillTypeUnitRow[]>(
    [],
  );
  const [unitBreakdownLoading, setUnitBreakdownLoading] = useState(false);
  const supabase = useSupabase();

  useEffect(() => {
    if (!activeBillType) {
      setUnitBreakdownRows([]);
      return;
    }
    let cancelled = false;
    setUnitBreakdownLoading(true);

    const allTime = !from && !to;
    const fromPeriod = from ? dateToPeriod(from) : null;
    const toPeriod = to ? dateToPeriod(to) : null;

    let q = (supabase as any)
      .from('bills')
      .select(
        'unit_id, total_amount, paid_amount, advance_applied, status, due_date, units(unit_no)',
      )
      .eq('association_id', associationId)
      .eq('bill_type', activeBillType)
      .neq('status', 'Reversed')
      .neq('status', 'Void');
    if (!allTime) {
      if (fromPeriod) q = q.gte('period', fromPeriod);
      if (toPeriod) q = q.lte('period', toPeriod);
    }
    if (unitIds.length > 0) q = q.in('unit_id', unitIds);

    q.then(({ data }: { data: any[] | null }) => {
      if (cancelled) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const unitAgg = new Map<
        string,
        {
          unit_no: string;
          billed: number;
          collected: number;
          bill_count: number;
          has_overdue: boolean;
        }
      >();
      for (const b of data ?? []) {
        const uid = b.unit_id as string;
        const unit_no = (b.units as { unit_no: string } | null)?.unit_no ?? '-';
        const settled =
          Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0);
        const outstanding = Math.max(0, Number(b.total_amount) - settled);
        const isOverdue = outstanding > 0 && new Date(b.due_date) < today;
        const cur = unitAgg.get(uid) ?? {
          unit_no,
          billed: 0,
          collected: 0,
          bill_count: 0,
          has_overdue: false,
        };
        cur.billed += Number(b.total_amount);
        cur.collected += settled;
        cur.bill_count += 1;
        if (isOverdue) cur.has_overdue = true;
        unitAgg.set(uid, cur);
      }

      const result: BillTypeUnitRow[] = Array.from(unitAgg.entries())
        .map(([uid, v]) => {
          const outstanding = Math.max(0, v.billed - v.collected);
          let status: BillTypeUnitRow['status'] = 'paid';
          if (outstanding > 0) {
            if (v.has_overdue) status = 'overdue';
            else if (v.collected > 0) status = 'partial';
            else status = 'unpaid';
          }
          return {
            unit_id: uid,
            unit_no: v.unit_no,
            billed: v.billed,
            collected: v.collected,
            outstanding,
            bill_count: v.bill_count,
            status,
          };
        })
        .sort((a, b) => b.outstanding - a.outstanding);

      setUnitBreakdownRows(result);
      setUnitBreakdownLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeBillType, associationId, from, to, unitIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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
            onClick={() => handleViewChange('received')}
            className={`px-3 py-1.5 transition-colors first:rounded-l-lg last:rounded-r-lg ${
              view === 'received'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            Payments Received
          </button>
          <button
            onClick={() => handleViewChange('raised')}
            className={`px-3 py-1.5 transition-colors first:rounded-l-lg last:rounded-r-lg ${
              view === 'raised'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            Bills Raised
          </button>
        </div>
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
            // Can exceed "Total Received" - a bill settled from the unit's
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
            value={collectionRate !== null ? `${collectionRate}%` : '-'}
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
            value={collectionRate !== null ? `${collectionRate}%` : '-'}
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
        {/* Primary bar chart - 2/3 width */}
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
                    fill="var(--muted-foreground)"
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

        {/* Donut - 1/3 width, always from payments by bill type */}
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

      {/* Collection rate line - only shown in "Bills Raised" view when there's enough data */}
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
                  stroke="var(--muted-foreground)"
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

      {/* Unit breakdown - shown when a charge type is selected in the donut.
          In "Payments Received" view only show units that actually have
          collected amounts; in "Bills Raised" show all units. */}
      {activeBillType && (
        <UnitBreakdownTable
          associationId={associationId}
          from={from}
          to={to}
          unitIds={unitIds}
          activeBillType={activeBillType}
          billTypeLabel={billTypeLabel(activeBillType)}
          view={view}
          rows={
            view === 'received'
              ? unitBreakdownRows.filter((r) => r.collected > 0)
              : unitBreakdownRows
          }
          loading={unitBreakdownLoading}
        />
      )}
    </div>
  );
}

// ── Unit breakdown sub-component ──────────────────────────────────────────────

function UnitBreakdownTable({
  associationId,
  from,
  to,
  unitIds,
  activeBillType,
  billTypeLabel: label,
  view,
  rows,
  loading,
}: {
  associationId: string;
  from: string;
  to: string;
  unitIds: string[];
  activeBillType: string;
  billTypeLabel: string;
  view: 'received' | 'raised';
  rows: BillTypeUnitRow[];
  loading: boolean;
}) {
  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(rows, label);

  const [csvPending, startCsvTransition] = useTransition();
  const [pdfPending, startPdfTransition] = useTransition();

  // CSV is generated client-side from the rows already in memory (fast,
  // no server round-trip) then falls back to the server action which also
  // includes the period-level summary above the unit breakdown.
  const handleCsvDownload = () => {
    startCsvTransition(async () => {
      const result = await downloadCsvAction(
        associationId,
        from,
        to,
        'collection',
        {
          billTypes: [activeBillType],
          unitIds,
          collectedOnly: view === 'received',
        },
      );
      if (!result.success) {
        toast.error(result.error ?? 'Could not generate CSV.');
        return;
      }
      const blob = new Blob([result.csv!], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename ?? `collection_${activeBillType}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handlePdfDownload = () => {
    startPdfTransition(async () => {
      const result = await downloadPdfAction(
        associationId,
        from,
        to,
        'collection',
        {
          billTypes: [activeBillType],
          unitIds,
          collectedOnly: view === 'received',
        },
      );
      if (!result.success) {
        toast.error(result.error ?? 'Could not generate PDF.');
        return;
      }
      const binary = atob(result.base64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename ?? `collection_${activeBillType}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const isPending = csvPending || pdfPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              Unit breakdown · {label}
              {view === 'received' && (
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  units with payments only
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-0.5">
              Per-unit collection status for the selected charge type
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCsvDownload}
              disabled={isPending || loading || rows.length === 0}
              data-test="collection-unit-breakdown-csv"
            >
              {csvPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePdfDownload}
              disabled={isPending || loading || rows.length === 0}
              data-test="collection-unit-breakdown-pdf"
            >
              {pdfPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="bg-muted h-32 animate-pulse rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No {view === 'received' ? 'payments received' : 'bills'} found for{' '}
            {label} in the selected period.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Billed (₹)</TableHead>
                    <TableHead className="text-right">Collected (₹)</TableHead>
                    <TableHead className="text-right">
                      Outstanding (₹)
                    </TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r) => {
                    const badge = STATUS_BADGE[r.status];
                    return (
                      <TableRow key={r.unit_id}>
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
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatINR(r.outstanding)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Total ({rows.length} units)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rows.reduce((s, r) => s + r.bill_count, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(totalBilled)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(totalCollected)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(totalOutstanding)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              fromIndex={fromIndex}
              toIndex={toIndex}
              onPageChange={setPage}
              label="units"
              testPrefix="collection-unit-breakdown"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
