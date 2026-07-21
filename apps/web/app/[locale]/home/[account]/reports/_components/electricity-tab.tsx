'use client';

import { useMemo, useState } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
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

import { type MescomRow, type UnitConsumptionRow } from '../_lib/reports-types';
import { TOOLTIP_STYLE } from './chart-tooltip-style';
import { KpiTile } from './kpi-tile';

interface Props {
  mescomRows: MescomRow[];
  consumptionByPeriod: Record<string, UnitConsumptionRow[]>;
}

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

export function ElectricityTab({ mescomRows, consumptionByPeriod }: Props) {
  const periods = mescomRows
    .map((r) => r.period)
    .sort((a, b) => b.localeCompare(a));
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0] ?? '');

  const totalCost = mescomRows.reduce((s, r) => s + r.invoice_amount, 0);
  const totalUnits = mescomRows.reduce(
    (s, r) => s + r.block_consumption_units,
    0,
  );
  const avgRate = totalUnits > 0 ? totalCost / totalUnits : null;

  // Dual-axis trend data
  const trendData = useMemo(
    () =>
      [...mescomRows]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((r) => ({
          period: shortPeriod(r.period),
          fullPeriod: formatPeriod(r.period),
          cost: r.invoice_amount,
          units: r.block_consumption_units,
          rate: r.rate ?? 0,
        })),
    [mescomRows],
  );

  // Per-unit consumption for selected period
  const unitConsumption = useMemo(
    () =>
      (consumptionByPeriod[selectedPeriod] ?? [])
        .filter((r) => r.consumed_units > 0)
        .sort((a, b) => b.consumed_units - a.consumed_units),
    [consumptionByPeriod, selectedPeriod],
  );

  if (mescomRows.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No electricity bills uploaded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <KpiTile
          label="Total Cost"
          value={formatINR(totalCost)}
          sub={`${mescomRows.length} billing periods`}
          highlight="amber"
        />
        <KpiTile
          label="Total Block Units"
          value={`${totalUnits.toLocaleString('en-IN')} kWh`}
        />
        <KpiTile
          label="Avg Rate / kWh"
          value={avgRate !== null ? formatINR(avgRate) : '—'}
          sub="blended rate across all periods"
        />
      </div>

      {/* Cost & consumption trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cost & Consumption Trend</CardTitle>
          <CardDescription>
            Invoice amount and block units — spot rate changes visually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={trendData}
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
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
                yAxisId="cost"
                tickFormatter={inrK}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <YAxis
                yAxisId="units"
                orientation="right"
                tickFormatter={(v) => `${v}u`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                formatter={(val: any, key: any) => {
                  if (key === 'cost') return [formatINR(val), 'Invoice Amount'];
                  if (key === 'units') return [`${val} kWh`, 'Block Units'];
                  return [val, key];
                }}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.fullPeriod ?? label
                }
                {...TOOLTIP_STYLE}
              />
              <Legend
                formatter={(key) =>
                  key === 'cost' ? 'Invoice Amount' : 'Block Units'
                }
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                yAxisId="cost"
                dataKey="cost"
                fill="#f59e0b"
                fillOpacity={0.8}
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="units"
                dataKey="units"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-unit consumption */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Unit-wise Consumption</CardTitle>
              <CardDescription>
                Top consumers for the selected period
              </CardDescription>
            </div>
            <Select
              value={selectedPeriod}
              onValueChange={(v) => setSelectedPeriod(v ?? '')}
            >
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {formatPeriod(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {unitConsumption.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No meter readings found for this period.
            </p>
          ) : (
            <>
              <ResponsiveContainer
                width="100%"
                height={Math.min(unitConsumption.length * 32 + 20, 280)}
              >
                <BarChart
                  data={unitConsumption.slice(0, 15)}
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
                    tickFormatter={(v) => `${v}u`}
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
                    formatter={(val: any) => [`${val} kWh`, 'Consumed']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--card-foreground))',
                    }}
                  />
                  <Bar
                    dataKey="consumed_units"
                    fill="#f59e0b"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>

              {/* Detail table */}
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Prev Reading</TableHead>
                      <TableHead className="text-right">Curr Reading</TableHead>
                      <TableHead className="text-right">Units (kWh)</TableHead>
                      <TableHead className="text-right">Charged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unitConsumption.map((r) => (
                      <TableRow key={r.unit_no}>
                        <TableCell className="font-medium">
                          {r.unit_no}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.prev_reading?.toLocaleString('en-IN') ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.curr_reading?.toLocaleString('en-IN') ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {r.consumed_units.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(r.charged_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
