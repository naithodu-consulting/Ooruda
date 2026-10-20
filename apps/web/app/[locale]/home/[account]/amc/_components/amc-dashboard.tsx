'use client';

import Link from 'next/link';

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

import { formatINR } from '~/lib/format-inr';

import type { DashboardStats } from './amc-page-client';
import { AmcStatusBadge } from './amc-status-badge';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

interface Props {
  associationId: string;
  accountSlug: string;
  stats: DashboardStats;
}

export function AmcDashboard({ accountSlug, stats }: Props) {
  // Build category donut data from all non-terminated contracts
  const categoryMap = new Map<string, number>();
  stats.all
    .filter((c) => c.status !== 'terminated')
    .forEach((c) => {
      categoryMap.set(
        c.category,
        (categoryMap.get(c.category) ?? 0) + c.contract_value,
      );
    });
  const categoryData = Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  function daysLeft(endDate: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return Math.round(
      (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return (
    <div className={'flex flex-col gap-y-6'}>
      {/* KPI row */}
      <div className={'grid grid-cols-2 gap-3 sm:grid-cols-4'}>
        <StatCard
          label={'On Track'}
          value={String(stats.active)}
          highlight={'text-foreground'}
        />
        <StatCard
          label={'Expiring Soon'}
          value={String(stats.dueSoon)}
          highlight={'text-info'}
        />
        <StatCard
          label={'Urgent / Critical'}
          value={String(stats.urgent + stats.critical)}
          highlight={'text-warning'}
        />
        <StatCard
          label={'Total Annual Cost'}
          value={formatINR(stats.totalAnnualCost)}
          highlight={'text-foreground'}
        />
      </div>

      <div className={'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {/* Needs Attention */}
        <Card>
          <CardHeader className={'pb-2'}>
            <CardTitle>Needs Attention</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.needsAttention.length === 0 ? (
              <p className={'text-muted-foreground py-8 text-center text-sm'}>
                All contracts are in good shape.
              </p>
            ) : (
              <ul className={'flex flex-col gap-y-2'}>
                {stats.needsAttention.map((c) => {
                  const d = daysLeft(c.end_date);
                  return (
                    <li
                      key={c.id}
                      className={
                        'flex items-center justify-between rounded-md border px-3 py-2'
                      }
                    >
                      <div className={'flex min-w-0 flex-col'}>
                        <Link
                          href={`/home/${accountSlug}/amc/${c.id}`}
                          className={'hover:text-brand-ink text-sm font-medium'}
                        >
                          {c.name}
                        </Link>
                        <span className={'text-muted-foreground text-xs'}>
                          {c.vendor_name} · {c.category}
                        </span>
                      </div>
                      <div className={'flex items-center gap-2'}>
                        <span
                          className={
                            'text-muted-foreground text-xs tabular-nums'
                          }
                        >
                          {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}
                        </span>
                        <AmcStatusBadge status={c.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Category spend donut */}
        <Card>
          <CardHeader className={'pb-2'}>
            <CardTitle>Contract Value by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className={'text-muted-foreground py-8 text-center text-sm'}>
                No contracts yet.
              </p>
            ) : (
              <ResponsiveContainer width={'100%'} height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey={'value'}
                    nameKey={'name'}
                    innerRadius={'55%'}
                    outerRadius={'80%'}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Legend
                    iconType={'circle'}
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick link */}
      {stats.expired > 0 && (
        <div
          className={
            'bg-destructive/5 border-destructive/20 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
          }
        >
          <span className={'text-sm font-medium'}>
            {stats.expired} expired{' '}
            {stats.expired === 1 ? 'contract' : 'contracts'}. Renew or terminate
            to keep records clean.
          </span>
          <Button
            variant={'outline'}
            size={'sm'}
            className={'w-full sm:w-auto'}
            render={
              <Link
                href={`/home/${accountSlug}/amc?tab=list&status=expired`}
                data-test={'view-expired-btn'}
              />
            }
          >
            View Expired
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight: string;
}) {
  return (
    <Card>
      <CardContent className={'py-4'}>
        <p className={'text-muted-foreground text-xs'}>{label}</p>
        <p
          className={`mt-1 truncate text-lg font-semibold tabular-nums ${highlight}`}
          title={value}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
