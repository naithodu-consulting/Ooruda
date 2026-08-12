'use client';

import { useState } from 'react';

import Link from 'next/link';

import { AlertTriangle, Banknote, Clock, Receipt } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { MetricCard } from '@kit/ui/metric-card';
import { cn } from '@kit/ui/utils';

import { getDurationItems } from '~/lib/bill-filter-items';
import { formatINR } from '~/lib/format-inr';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OverviewMetrics {
  periodDisplay: string;
  billsGenerated: number;
  billed: number;
  collected: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  ageing: { d0to7: number; d8to30: number; d30plus: number };
}

export interface StaticOverviewData {
  totalUnits: number;
  occupiedUnits: number;
  mescomBillUploaded: boolean;
  currentMonth: string;
  recentActivity: {
    action: string;
    summary: string | null;
    created_at: string;
  }[];
}

interface Props {
  account: string;
  initialDuration: string;
  metricsByDuration: Record<string, OverviewMetrics>;
  staticData: StaticOverviewData;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function AgeingBar(props: {
  label: string;
  amount: number;
  maxAmount: number;
  colorClassName: string;
  textClassName: string;
}) {
  const width =
    props.maxAmount > 0
      ? `${Math.max(4, (props.amount / props.maxAmount) * 100)}%`
      : '0%';

  return (
    <div>
      <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-xs font-semibold">
        <span>{props.label}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${props.colorClassName}`}
          style={{ width }}
        />
      </div>
      <p className={`mt-1 text-sm font-semibold ${props.textClassName}`}>
        {formatINR(props.amount)}
      </p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AdminOverviewPanel({
  account,
  initialDuration,
  metricsByDuration,
  staticData,
}: Props) {
  const [activeDuration, setActiveDuration] = useState(initialDuration);

  const items = getDurationItems();
  const options = [
    { value: 'current_month', label: 'Current Month' },
    { value: 'prev_month', label: 'Last Month' },
    { value: 'last_3m', label: '3 Months' },
    { value: 'last_6m', label: '6 Months' },
    { value: 'this_fy', label: items.this_fy },
    { value: 'prev_fy', label: items.prev_fy },
    { value: 'all', label: 'All Time' },
  ];

  // Fall back to current_month if the active duration has no data (shouldn't happen).
  const metrics =
    metricsByDuration[activeDuration] ?? metricsByDuration['current_month']!;

  const ageingMax = Math.max(
    metrics.ageing.d0to7,
    metrics.ageing.d8to30,
    metrics.ageing.d30plus,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header row: meta-text + duration pills */}
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {`${metrics.periodDisplay} · ${staticData.totalUnits} residential units · ${staticData.occupiedUnits} occupied`}
        </p>

        {/* Duration pill selector — purely client-side, no navigation */}
        <div
          className="bg-muted no-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-full p-0.5"
          data-test="dashboard-duration-select"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setActiveDuration(opt.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                activeDuration === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/home/${account}/billing/units?duration=${activeDuration}`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-blue-300 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none dark:hover:ring-blue-700"
        >
          <MetricCard
            icon={Receipt}
            variant="blue"
            label="Billed"
            value={formatINR(metrics.billed)}
            sublabel={`${metrics.billsGenerated} bills generated`}
            className="h-full"
          />
        </Link>
        <Link
          href={`/home/${account}/payments?duration=${activeDuration}&status=paid`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-green-300 focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:outline-none dark:hover:ring-green-700"
        >
          <MetricCard
            icon={Banknote}
            variant="green"
            label="Collected"
            value={formatINR(metrics.collected)}
            sublabel={
              metrics.billed > 0
                ? `${Math.round((metrics.collected / metrics.billed) * 100)}% collection rate`
                : 'No bills yet'
            }
            className="h-full"
          />
        </Link>
        <Link
          href={`/home/${account}/billing/units?duration=${activeDuration}&filter=outstanding`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-amber-300 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none dark:hover:ring-amber-700"
        >
          <MetricCard
            icon={Clock}
            variant="amber"
            label="Outstanding"
            value={formatINR(metrics.outstanding)}
            sublabel="Pending collection"
            className="h-full"
          />
        </Link>
        <Link
          href={`/home/${account}/billing/units?duration=${activeDuration}&filter=overdue`}
          className="block rounded-2xl ring-0 transition-shadow hover:ring-2 hover:ring-red-300 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none dark:hover:ring-red-700"
        >
          <MetricCard
            icon={AlertTriangle}
            variant="red"
            label="Overdue"
            value={formatINR(metrics.overdueAmount)}
            sublabel={`${metrics.overdueCount} bill${metrics.overdueCount !== 1 ? 's' : ''}`}
            className="h-full"
          />
        </Link>
      </div>

      {/* Collection progress + ageing */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-bold">
              Collection progress
            </CardTitle>
            <Badge className={badgeExtras.success}>
              {metrics.periodDisplay}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total billed</span>
                <span className="font-semibold">
                  {formatINR(metrics.billed)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Collected</span>
                <span className="font-semibold text-emerald-600">
                  {formatINR(metrics.collected)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-semibold text-amber-600">
                  {formatINR(metrics.outstanding)}
                </span>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600"
                style={{
                  width:
                    metrics.billed > 0
                      ? `${Math.min(100, (metrics.collected / metrics.billed) * 100)}%`
                      : '0%',
                }}
              />
            </div>
            <p className="mt-1.5 text-right text-xs font-semibold text-amber-600">
              {metrics.billed > 0
                ? `${Math.round((metrics.collected / metrics.billed) * 100)}% collected`
                : 'No bills yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Ageing analysis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <AgeingBar
              label="0–7 days"
              amount={metrics.ageing.d0to7}
              maxAmount={ageingMax}
              colorClassName="bg-blue-500"
              textClassName="text-blue-600"
            />
            <AgeingBar
              label="8–30 days"
              amount={metrics.ageing.d8to30}
              maxAmount={ageingMax}
              colorClassName="bg-amber-500"
              textClassName="text-amber-600"
            />
            <AgeingBar
              label=">30 days overdue"
              amount={metrics.ageing.d30plus}
              maxAmount={ageingMax}
              colorClassName="bg-red-500"
              textClassName="text-red-600"
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent activity — static, never changes with duration */}
      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-bold">Recent activity</CardTitle>
          <Link
            href={`/home/${account}/audit`}
            className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline"
          >
            View all &rarr;
          </Link>
        </CardHeader>
        <CardContent>
          {staticData.recentActivity.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nothing has happened here yet.
            </p>
          ) : (
            <div className="flex flex-col">
              {staticData.recentActivity.map((entry, i) => {
                const isGreen =
                  entry.action.includes('payment') ||
                  entry.action.includes('unit.created');
                const isBlue = entry.action.includes('bill');
                const badgeBg = isGreen
                  ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                  : isBlue
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400';
                const dotBg = isGreen
                  ? 'bg-green-500'
                  : isBlue
                    ? 'bg-blue-500'
                    : 'bg-slate-400';

                return (
                  <div
                    key={i}
                    className="border-border flex min-w-0 flex-col gap-2 border-b py-4 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm font-medium break-words">
                      {entry.summary ?? entry.action}
                    </span>
                    <div
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${badgeBg}`}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full ${dotBg}`} />
                      {new Date(entry.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
