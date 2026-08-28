'use client';

import { useEffect, useState } from 'react';

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Skeleton } from '@kit/ui/skeleton';

import { formatINR } from '~/lib/format-inr';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function getFyRange(referenceDate?: string) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  return { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31` };
}

interface AnalyticsData {
  totalThisMonth: number;
  totalThisFy: number;
  countThisMonth: number;
  topCategoryThisMonth: string | null;
  categoryBreakdown: { name: string; value: number }[];
  monthlyTrend: { month: string; amount: number }[];
  topPayees: { name: string; amount: number }[];
  modeBreakdown: { name: string; value: number }[];
}

interface Props {
  associationId: string;
}

export function ExpenseAnalytics({ associationId }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      const fyRange = getFyRange();

      // Fetch expenses for the selected FY
      const res = await fetch(
        `/api/expenses/analytics?associationId=${associationId}&from=${fyRange.from}&to=${fyRange.to}`,
      );
      if (!res.ok || cancelled) return;

      const json = (await res.json()) as AnalyticsData;
      if (!cancelled) {
        setData(json);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [associationId]);

  if (loading) return <AnalyticsSkeleton />;
  if (!data)
    return (
      <p className={'text-muted-foreground text-sm'}>
        Could not load analytics.
      </p>
    );

  return (
    <div className={'flex flex-col gap-y-6'}>
      {/* KPI Row */}
      <div className={'grid grid-cols-2 gap-3 sm:grid-cols-4'}>
        <KpiCard
          label={'Spend this month'}
          value={formatINR(data.totalThisMonth)}
        />
        <KpiCard label={'Spend this FY'} value={formatINR(data.totalThisFy)} />
        <KpiCard
          label={'Entries this month'}
          value={String(data.countThisMonth)}
        />
        <KpiCard
          label={'Top category'}
          value={data.topCategoryThisMonth ?? '—'}
        />
      </div>

      {/* Charts row */}
      <div className={'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {/* Category donut */}
        <Card>
          <CardHeader className={'pb-2'}>
            <CardTitle className={'text-sm font-medium'}>
              Spend by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.categoryBreakdown.length === 0 ? (
              <ChartEmpty message={'No expenses recorded yet.'} />
            ) : (
              <ResponsiveContainer width={'100%'} height={220}>
                <PieChart>
                  <Pie
                    data={data.categoryBreakdown}
                    dataKey={'value'}
                    nameKey={'name'}
                    innerRadius={'55%'}
                    outerRadius={'80%'}
                    paddingAngle={2}
                  >
                    {data.categoryBreakdown.map((_, i) => (
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

        {/* Monthly trend */}
        <Card>
          <CardHeader className={'pb-2'}>
            <CardTitle className={'text-sm font-medium'}>
              Monthly Trend (This FY)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyTrend.every((d) => d.amount === 0) ? (
              <ChartEmpty
                message={'No expenses recorded this financial year.'}
              />
            ) : (
              <ResponsiveContainer width={'100%'} height={220}>
                <BarChart data={data.monthlyTrend} margin={{ left: -10 }}>
                  <XAxis dataKey={'month'} tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Bar
                    dataKey={'amount'}
                    fill={CHART_COLORS[0]}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 10 payees */}
        <Card>
          <CardHeader className={'pb-2'}>
            <CardTitle className={'text-sm font-medium'}>Top Payees</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topPayees.length === 0 ? (
              <ChartEmpty message={'No payee data available yet.'} />
            ) : (
              <ResponsiveContainer width={'100%'} height={220}>
                <BarChart
                  layout={'vertical'}
                  data={data.topPayees.slice(0, 10)}
                  margin={{ left: 10 }}
                >
                  <XAxis
                    type={'number'}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type={'category'}
                    dataKey={'name'}
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip
                    formatter={(v) => [formatINR(Number(v)), 'Amount']}
                  />
                  <Bar
                    dataKey={'amount'}
                    name={'Amount'}
                    fill={CHART_COLORS[1]}
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment mode breakdown */}
        <Card>
          <CardHeader className={'pb-2'}>
            <CardTitle className={'text-sm font-medium'}>
              Payment Modes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.modeBreakdown.length === 0 ? (
              <ChartEmpty message={'No payment data available yet.'} />
            ) : (
              <ResponsiveContainer width={'100%'} height={220}>
                <PieChart>
                  <Pie
                    data={data.modeBreakdown}
                    dataKey={'value'}
                    nameKey={'name'}
                    innerRadius={'55%'}
                    outerRadius={'80%'}
                    paddingAngle={2}
                  >
                    {data.modeBreakdown.map((_, i) => (
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
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <p className={'text-muted-foreground py-8 text-center text-sm'}>
      {message}
    </p>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className={'py-4'}>
        <p className={'text-muted-foreground text-xs'}>{label}</p>
        <p
          className={'mt-1 truncate text-lg font-semibold tabular-nums'}
          title={value}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className={'flex flex-col gap-y-6'}>
      <div className={'grid grid-cols-2 gap-3 sm:grid-cols-4'}>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className={'py-4'}>
              <Skeleton className={'h-12 w-full'} />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className={'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className={'py-4'}>
              <Skeleton className={'h-52 w-full'} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
