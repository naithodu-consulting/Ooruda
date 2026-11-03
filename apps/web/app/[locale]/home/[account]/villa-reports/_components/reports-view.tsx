'use client';

import { useEffect, useState, useTransition } from 'react';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Star,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { Skeleton } from '@kit/ui/skeleton';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { channelLabel, paymentModeLabel } from '~/lib/villa/labels';
import {
  type ChannelLine,
  type GstReport,
  type GuestsReport,
  type Overview,
  type PaymentsReport,
  REPORT_PRESET_LABELS,
  type ReportExpense,
  type ReportPreset,
  type ReportRange,
  toCsv,
} from '~/lib/villa/reports';

import { EXPENSE_CATEGORY_LABELS } from '../../villa-expenses/_lib/schemas/villa-expenses.schema';
import { downloadVillaReportPdfAction } from '../_lib/server/report-pdf-action';

export type ReportTab =
  | 'overview'
  | 'expenses'
  | 'payments'
  | 'gst_summary'
  | 'channels'
  | 'guests';

const TAB_GROUPS = [
  {
    key: 'financial',
    label: 'Financial',
    tabs: [
      { value: 'overview' as ReportTab, label: 'Revenue & Occupancy' },
      { value: 'expenses' as ReportTab, label: 'Expenses' },
      { value: 'payments' as ReportTab, label: 'Payments & Refunds' },
      { value: 'gst_summary' as ReportTab, label: 'GST Summary' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    tabs: [
      { value: 'channels' as ReportTab, label: 'Booking Channels' },
      { value: 'guests' as ReportTab, label: 'Guest Directory' },
    ],
  },
] as const;

/**
 * Recharts is the heaviest thing this screen pulls in, and four of the six
 * tabs draw no graph, so the charts arrive on demand instead of blocking the
 * tables and figures. `ssr: false` because a chart measures its container
 * before it can lay itself out — there is nothing useful to render on the
 * server. The skeleton matches the chart box, so nothing jumps when it lands.
 */
const ChartFallback = () => <Skeleton className="h-full w-full rounded-lg" />;

const RevenueExpensesChart = dynamic(
  () => import('./report-charts').then((m) => m.RevenueExpensesChart),
  { ssr: false, loading: ChartFallback },
);

const OccupancyTrendChart = dynamic(
  () => import('./report-charts').then((m) => m.OccupancyTrendChart),
  { ssr: false, loading: ChartFallback },
);

const DonutChart = dynamic(
  () => import('./report-charts').then((m) => m.DonutChart),
  { ssr: false, loading: ChartFallback },
);

const PILL_PRESETS: ReportPreset[] = [
  'this_month',
  'last_month',
  '3m',
  '6m',
  'this_fy',
  'last_fy',
];

const monthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

const fullMonthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const categoryLabel = (c: string) =>
  EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS] ?? c;

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

const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

/**
 * The anchor is put in the document and the blob URL is revoked on a later
 * tick: Firefox ignores a click on a detached anchor, and revoking in the same
 * tick as the click cancels the download in Firefox and Safari.
 */
function download(filename: string, csv: string) {
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

// ── Shared pagination hook + footer (matches Ooruda Reports) ──────────────────

const REPORTS_PAGE_SIZE = 25;

function usePagedRows<T>(
  rows: T[],
  resetKey: unknown = null,
  pageSize: number = REPORTS_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey, total]);

  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return {
    page: safePage,
    setPage,
    paged,
    totalPages,
    total,
    fromIndex: total === 0 ? 0 : start + 1,
    toIndex: Math.min(start + pageSize, total),
  };
}

function TablePagination(props: {
  page: number;
  totalPages: number;
  total: number;
  fromIndex: number;
  toIndex: number;
  onPageChange: (p: number) => void;
  label?: string;
  testPrefix: string;
}) {
  const {
    page,
    totalPages,
    total,
    fromIndex,
    toIndex,
    onPageChange,
    label = 'rows',
    testPrefix,
  } = props;

  const btn =
    'border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <p className="text-muted-foreground text-sm">
        {total === 0 ? (
          <>No {label}</>
        ) : (
          <>
            Showing{' '}
            <span className="text-foreground font-medium tabular-nums">
              {fromIndex}–{toIndex}
            </span>{' '}
            of{' '}
            <span className="text-foreground font-medium tabular-nums">
              {total}
            </span>{' '}
            {label}
          </>
        )}
      </p>

      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            data-test={`${testPrefix}-pagination-prev`}
            className={btn}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-muted-foreground px-3 text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            data-test={`${testPrefix}-pagination-next`}
            className={btn}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── Shared KPI tile (matches Ooruda Reports KpiTile) ──────────────────────────

const HIGHLIGHT_CLASS: Record<string, string> = {
  green: 'text-success',
  amber: 'text-warning',
  red: 'text-destructive',
  blue: 'text-info',
};

function KpiTile(props: {
  label: string;
  value: string;
  sub?: string;
  highlight?: 'green' | 'amber' | 'red' | 'blue';
  test?: string;
}) {
  return (
    <Card
      className="bg-card rounded-2xl"
      data-test={props.test ? `villa-report-${props.test}` : undefined}
    >
      <CardContent className="p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
            {props.label}
          </p>
          <p
            className={cn(
              'text-2xl leading-none font-bold tabular-nums',
              props.highlight ? HIGHLIGHT_CLASS[props.highlight] : '',
            )}
          >
            {props.value}
          </p>
          {props.sub ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{props.sub}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function ReportsView(props: {
  account: string;
  tab: ReportTab;
  range: ReportRange;
  today: string;
  propertyName: string;
  propertyId: string | null;
  /** The villa account, for the server-rendered PDF export. */
  accountId: string;
  /** Always the real property id; propertyId is only for link building. */
  exportPropertyId: string;
  syncedAt: string | null;
  overview: Overview;
  expenses?: ReportExpense[];
  payments?: PaymentsReport | null;
  gst?: GstReport | null;
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

  const [isPending, startTransition] = useTransition();
  const [pendingTab, setPendingTab] = useState<ReportTab | null>(null);
  const [pendingRange, setPendingRange] = useState<string | null>(null);

  useEffect(() => {
    setPendingTab(null);
  }, [props.tab]);

  useEffect(() => {
    setPendingRange(null);
  }, [props.range.preset]);

  const activeTab = pendingTab ?? props.tab;
  const activePreset = pendingRange ?? props.range.preset;

  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(props.range.from);
  const [customTo, setCustomTo] = useState(props.range.to);

  useEffect(() => {
    setCustomFrom(props.range.from);
    setCustomTo(props.range.to);
  }, [props.range.from, props.range.to]);

  const invalidCustom =
    Boolean(customFrom) && Boolean(customTo) && customFrom > customTo;

  const period = `${formatDateReadable(props.range.from)} – ${formatDateReadable(props.range.to)}`;
  const fileStem = `${props.propertyName.replace(/[^\w-]+/g, '-')}-${props.range.from}-to-${props.range.to}`;

  const activeGroup =
    TAB_GROUPS.find((g) => g.tabs.some((t) => t.value === activeTab)) ??
    TAB_GROUPS[0];

  function exportCsv() {
    const o = props.overview;

    if (props.tab === 'expenses') {
      const expRows = props.expenses ?? [];
      download(
        `${fileStem}-expenses.csv`,
        toCsv([
          [
            'Date',
            'Category',
            'Description',
            'Vendor',
            'Mode',
            'Invoice No',
            'Amount (INR)',
            'GST Paid (INR)',
          ],
          ...expRows.map((e) => [
            e.spent_on,
            categoryLabel(e.category),
            e.description ?? '',
            e.vendor ?? '',
            paymentModeLabel(e.mode ?? 'other'),
            e.invoice_no ?? '',
            e.amount,
            e.gst_amount,
          ]),
        ]),
      );
      return;
    }

    if (props.tab === 'payments' && props.payments) {
      download(
        `${fileStem}-payments.csv`,
        toCsv([
          ['Date', 'Booking', 'Payer', 'Mode', 'Reference', 'Amount (INR)'],
          ...props.payments.rows.map((p) => [
            p.paid_on,
            p.booking_code ?? '',
            p.payer_name ?? '',
            paymentModeLabel(p.mode),
            p.reference ?? '',
            p.amount,
          ]),
        ]),
      );
      return;
    }

    if (props.tab === 'gst_summary' && props.gst) {
      download(
        `${fileStem}-gst-summary.csv`,
        toCsv([
          [
            'Month',
            'Stays',
            'Nights',
            'Taxable Revenue (INR)',
            'Output GST (INR)',
            'Total with GST (INR)',
            'Expenses (INR)',
            'Input GST (INR)',
            'Net GST Payable (INR)',
          ],
          ...props.gst.months.map((m) => [
            m.month,
            m.stays,
            m.nights,
            m.taxableRevenue,
            m.outputGst,
            m.totalWithGst,
            m.expenseAmount,
            m.inputGst,
            m.netGstPayable,
          ]),
        ]),
      );
      return;
    }

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
      const list = props.guests.allGuests ?? props.guests.top;
      download(
        `${fileStem}-guests.csv`,
        toCsv([
          [
            'Guest',
            'Phone',
            'Stays to date',
            'Nights to date',
            'Revenue before GST to date (INR)',
            'Last stay',
          ],
          ...list.map((g) => [
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
          'Booking Value',
          'Expenses (INR)',
          'Net Received',
        ],
        ...o.months.map((m) => [
          m.month,
          m.nights,
          m.available,
          m.occupancyPct,
          m.grossRevenue,
          m.expenses,
          m.netReceived,
        ]),
        [
          'Total',
          o.bookedNights,
          o.days,
          o.occupancyPct,
          o.grossRevenue,
          o.expenses,
          o.netReceived,
        ],
      ]),
    );
  }

  const [pdfPending, startPdf] = useTransition();

  /**
   * The PDF is built on the server from the same loader the page reads, not
   * printed from this screen: a browser print sheet carried the charts, the
   * filter pills and only the rows this tab had paged into view.
   */
  function exportPdf() {
    startPdf(async () => {
      const result = await downloadVillaReportPdfAction(
        props.accountId,
        props.exportPropertyId,
        props.tab,
        props.range.from,
        props.range.to,
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const binary = atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/pdf' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 0);
    });
  }

  return (
    <div className="flex flex-col gap-6 print:max-w-none">
      <style>{`@media print {
        [data-sidebar="sidebar"], [data-slot="sidebar-gap"], header { display: none !important; }
        body { background: #fff !important; }
      }`}</style>

      {/* ── Print-only Header ── */}
      <div className="hidden border-b pb-3 print:block">
        <h1 className="text-xl font-bold">{props.propertyName}</h1>
        <p className="text-muted-foreground text-sm font-medium">{period}</p>
      </div>

      {/* ── Date Range Picker (matches Ooruda Reports DateRangePicker) ── */}
      <div
        className="flex flex-wrap items-center gap-2 print:hidden"
        data-test={'villa-reports-period'}
      >
        <div
          className="flex overflow-x-auto rounded-lg border text-sm"
          data-test={'villa-reports-range'}
        >
          {PILL_PRESETS.map((p) => {
            const active = activePreset === p;
            return (
              <Link
                key={p}
                href={href({ range: p })}
                scroll={false}
                data-test={`villa-reports-range-${p}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || active) return;
                  e.preventDefault();
                  setPendingRange(p);
                  startTransition(() => {
                    router.push(href({ range: p }), { scroll: false });
                  });
                }}
                className={cn(
                  'shrink-0 px-3 py-1.5 transition-colors first:rounded-l-lg last:rounded-r-lg',
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted text-muted-foreground',
                  isPending && active && 'opacity-80',
                )}
              >
                {REPORT_PRESET_LABELS[p]}
              </Link>
            );
          })}
        </div>

        {/* Custom date range popover */}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger
            data-test={'villa-reports-range-custom'}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
              props.range.preset === 'custom'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <CalendarRange className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {props.range.preset === 'custom' ? period : 'Custom range'}
            </span>
            <span className="sm:hidden">
              {props.range.preset === 'custom' ? period : 'Custom'}
            </span>
          </PopoverTrigger>

          <PopoverContent className="w-80 p-4" align="start">
            <p className="mb-3 text-xs font-semibold tracking-wide uppercase">
              Select date range
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  From
                </label>
                <DatePicker
                  value={customFrom}
                  onChange={(v) => {
                    if (!v) return;
                    setCustomFrom(v);
                    if (customTo && v > customTo) setCustomTo(v);
                  }}
                  max={customTo || undefined}
                  data-test={'villa-reports-from'}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  To
                </label>
                <DatePicker
                  value={customTo}
                  onChange={(v) => v && setCustomTo(v)}
                  min={customFrom || undefined}
                  data-test={'villa-reports-to'}
                />
              </div>
            </div>

            {invalidCustom ? (
              <p className="text-destructive mt-2 text-xs">
                &ldquo;From&rdquo; date must be before &ldquo;To&rdquo; date.
              </p>
            ) : customFrom && customTo ? (
              <p className="text-muted-foreground mt-2 text-xs">
                Range: {formatDateReadable(customFrom)} –{' '}
                {formatDateReadable(customTo)}
              </p>
            ) : null}

            <Button
              size="sm"
              className="mt-3 w-full"
              disabled={invalidCustom || !customFrom || !customTo}
              onClick={() => {
                setCustomOpen(false);
                router.push(
                  href({ range: 'custom', from: customFrom, to: customTo }),
                );
              }}
              data-test={'villa-reports-apply'}
            >
              Apply range
            </Button>
          </PopoverContent>
        </Popover>
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

      {/* ── Two-level Tab Hierarchy + Export (matches Ooruda ReportsTabs) ── */}
      <div className="print:hidden">
        {/* Level 1: Report Group segmented bar + Download menu */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-muted flex w-full flex-wrap gap-1 rounded-lg p-1 sm:w-auto">
            {TAB_GROUPS.map((group) => {
              const isActiveGroup = group.key === activeGroup.key;

              return (
                <Link
                  key={group.key}
                  href={href({ tab: group.tabs[0].value })}
                  scroll={false}
                  prefetch={true}
                  data-test={`villa-reports-group-${group.key}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || isActiveGroup) return;
                    e.preventDefault();
                    setPendingTab(group.tabs[0].value);
                    startTransition(() => {
                      router.push(href({ tab: group.tabs[0].value }), {
                        scroll: false,
                      });
                    });
                  }}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors sm:flex-none',
                    isActiveGroup
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                    isPending && isActiveGroup && 'opacity-80',
                  )}
                >
                  {group.label}
                </Link>
              );
            })}
          </div>

          <div className="flex shrink-0 justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={pdfPending}
                data-test={'villa-reports-export'}
                className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                {pdfPending ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {pdfPending ? 'Generating PDF…' : 'Download'}
                </span>
                <span className="sm:hidden">{pdfPending ? '…' : 'Export'}</span>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-[240px]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                    Download report
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={exportCsv}
                    data-test={'villa-reports-csv'}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <FileSpreadsheet className="text-success mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium">Download CSV</span>
                      <span className="text-muted-foreground text-xs">
                        Current tab · all rows in the period
                      </span>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={exportPdf}
                    disabled={pdfPending}
                    data-test={'villa-reports-pdf'}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <FileText className="text-info mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium">Download PDF</span>
                      <span className="text-muted-foreground text-xs">
                        Current tab · all rows in the period
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Level 2: Connected underline tablist */}
        <div
          role="tablist"
          className="border-border flex flex-wrap items-center gap-x-1 border-b"
        >
          {activeGroup.tabs.map((t) => {
            const isActive = t.value === activeTab;

            return (
              <Link
                key={t.value}
                href={href({ tab: t.value })}
                scroll={false}
                prefetch={true}
                role="tab"
                aria-selected={isActive}
                data-test={`villa-reports-tab-${t.value}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || isActive) return;
                  e.preventDefault();
                  setPendingTab(t.value);
                  startTransition(() => {
                    router.push(href({ tab: t.value }), { scroll: false });
                  });
                }}
                className={cn(
                  '-mb-px border-b-2 px-3 pt-1 pb-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent',
                  isPending && isActive && 'opacity-80',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Active Tab Content ───────────────────────────────── */}
      <div
        className={cn(
          'transition-opacity duration-150',
          isPending && 'pointer-events-none opacity-60',
        )}
      >
        {props.tab === 'overview' ? <OverviewTab o={props.overview} /> : null}
        {props.tab === 'expenses' ? (
          <ExpensesTab o={props.overview} rows={props.expenses ?? []} />
        ) : null}
        {props.tab === 'payments' && props.payments ? (
          <PaymentsTab p={props.payments} />
        ) : null}
        {props.tab === 'gst_summary' && props.gst ? (
          <GstSummaryTab g={props.gst} />
        ) : null}
        {props.tab === 'channels' ? (
          <ChannelsTab lines={props.channels} />
        ) : null}
        {props.tab === 'guests' && props.guests ? (
          <GuestsTab g={props.guests} />
        ) : null}
      </div>
    </div>
  );
}

// ── 1. Revenue & Occupancy Tab (Overview) ────────────────────────────────────

function OverviewTab({ o }: { o: Overview }) {
  const hasMonths = o.months.length > 0;
  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(o.months, o.months.length);

  return (
    <div className="flex flex-col gap-6">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          test="revenue"
          label="Total Booking Value"
          value={formatINR(o.grossRevenue)}
          highlight="green"
          sub={`${o.stays} stay${o.stays === 1 ? '' : 's'}${o.events ? `, ${o.events} event${o.events === 1 ? '' : 's'}` : ''}`}
        />
        <KpiTile
          test="occupancy"
          label="Occupancy Rate"
          value={`${o.occupancyPct}%`}
          highlight={
            o.occupancyPct >= 60
              ? 'green'
              : o.occupancyPct >= 30
                ? 'amber'
                : undefined
          }
          sub={`${o.bookedNights} of ${o.days} nights booked`}
        />
        <KpiTile
          test="expenses"
          label="Total Expenses"
          value={formatINR(o.expenses)}
          highlight={o.expenses > 0 ? 'amber' : undefined}
          sub={`${o.expensesByCategory.length} categor${o.expensesByCategory.length === 1 ? 'y' : 'ies'} · operating & channel`}
        />
        <KpiTile
          test="net"
          label="Net Received"
          value={formatINR(o.netReceived)}
          highlight={o.netReceived >= 0 ? 'green' : 'red'}
          sub="Net Booking amount"
        />
      </div>

      {/* Secondary Rate KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile
          test="adr"
          label="Avg. Daily Rate (ADR)"
          value={formatINR(o.grossAverageNightly)}
          sub="Average gross booking per booked night"
        />
        <KpiTile
          test="revpar"
          label="Revenue Per Available Night"
          value={formatINR(o.grossRevenuePerNight)}
          sub="RevPAR across all nights in period"
        />
      </div>

      {/* Charts row */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4',
          o.months.length >= 2 ? 'lg:grid-cols-3' : '',
        )}
      >
        <Card className={cn(o.months.length >= 2 ? 'lg:col-span-2' : '')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Monthly Revenue vs. Expenses
            </CardTitle>
            <CardDescription>
              Total booking value compared against operating expenses per month
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasMonths ? (
              <div className="h-[260px]" data-test={'villa-report-chart'}>
                <RevenueExpensesChart
                  data={o.months.map((m) => ({
                    label: monthLabel(m.month),
                    fullPeriod: fullMonthLabel(m.month),
                    revenue: m.grossRevenue,
                    expenses: m.expenses,
                  }))}
                />
              </div>
            ) : (
              <div className="flex h-[260px] items-center justify-center">
                <p className="text-muted-foreground text-sm">
                  No monthly data for this period.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {hasMonths && o.months.length >= 2 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Occupancy Trend</CardTitle>
              <CardDescription>
                Percentage of available nights sold each month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]" data-test={'villa-report-occ-chart'}>
                <OccupancyTrendChart
                  data={o.months.map((m) => ({
                    label: monthLabel(m.month),
                    fullPeriod: fullMonthLabel(m.month),
                    occupancy: m.occupancyPct,
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Month breakdown table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Performance</CardTitle>
          <CardDescription>
            Period-wise occupancy, booking value, operating expenses, and net
            received
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table data-test={'villa-report-months'}>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Nights</TableHead>
                  <TableHead className="text-right">Occupancy</TableHead>
                  <TableHead className="text-right">
                    Booking Value (₹)
                  </TableHead>
                  <TableHead className="text-right">Expenses (₹)</TableHead>
                  <TableHead className="text-right">Net Received (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">
                      {monthLabel(m.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.nights}
                      <span className="text-muted-foreground">
                        /{m.available}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.occupancyPct}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(m.grossRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.expenses > 0 ? formatINR(m.expenses) : '₹0'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        m.netReceived < 0
                          ? 'text-destructive'
                          : 'text-foreground',
                      )}
                    >
                      {formatINR(m.netReceived)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {o.months.length > 1 ? (
                <TableFooter>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.bookedNights}
                      <span className="text-muted-foreground">/{o.days}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.occupancyPct}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(o.grossRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(o.expenses)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        o.netReceived < 0
                          ? 'text-destructive'
                          : 'text-foreground',
                      )}
                    >
                      {formatINR(o.netReceived)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            fromIndex={fromIndex}
            toIndex={toIndex}
            onPageChange={setPage}
            label="months"
            testPrefix="overview-months"
          />
        </CardContent>
      </Card>

      {/* Expense category breakdown if expenses exist */}
      {o.expensesByCategory.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expenses by Category</CardTitle>
            <CardDescription>
              Share of operating expenses across categories in the selected
              period
            </CardDescription>
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
                      <span className="font-medium">
                        {categoryLabel(category)}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted-foreground text-xs">
                          {pct}%
                        </span>
                        <span className="font-semibold">
                          {formatINR(amount)}
                        </span>
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
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
    </div>
  );
}

// ── 2. Expenses Tab ──────────────────────────────────────────────────────────

function ExpensesTab({ o, rows }: { o: Overview; rows: ReportExpense[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filtered =
    selectedCategory === 'all'
      ? rows
      : rows.filter((r) => r.category === selectedCategory);

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, selectedCategory);

  const topCat = o.expensesByCategory[0];
  const categoriesWithPct = largestRemainderPct(o.expensesByCategory);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Total Expenses"
          value={formatINR(o.expenses)}
          highlight={o.expenses > 0 ? 'amber' : undefined}
          sub={`${rows.length} expense${rows.length === 1 ? '' : 's'} recorded`}
        />
        <KpiTile
          label="GST Paid on Expenses"
          value={formatINR(o.expensesGst)}
          sub="Input GST included in expenses"
        />
        <KpiTile
          label="Expenses Excl. GST"
          value={formatINR(Math.max(0, o.expenses - o.expensesGst))}
          sub="Net operating cost before tax"
        />
        <KpiTile
          label="Top Category"
          value={topCat ? categoryLabel(topCat.category) : '-'}
          sub={topCat ? formatINR(topCat.amount) : 'No expenses in period'}
        />
      </div>

      {categoriesWithPct.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Spend by Category</CardTitle>
              <CardDescription>
                Click a category below to filter the expense ledger
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <DonutChart
                  tooltipLabel="Spent"
                  slices={categoriesWithPct.map((c) => ({
                    name: categoryLabel(c.category),
                    value: c.amount,
                    key: c.category,
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Category Share</CardTitle>
              <CardDescription>
                Breakdown across {categoriesWithPct.length}{' '}
                {categoriesWithPct.length === 1 ? 'category' : 'categories'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {categoriesWithPct.map(({ category, amount, pct }, i) => (
                  <li key={category} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        {categoryLabel(category)}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted-foreground text-xs">
                          {pct}%
                        </span>
                        <span className="font-semibold">
                          {formatINR(amount)}
                        </span>
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Filter pills */}
      {categoriesWithPct.length > 1 ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selectedCategory === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:border-foreground/30',
            )}
          >
            All Categories ({rows.length})
          </button>
          {categoriesWithPct.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => setSelectedCategory(c.category)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedCategory === c.category
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:border-foreground/30',
              )}
            >
              {categoryLabel(c.category)}
            </button>
          ))}
        </div>
      ) : null}

      {/* Expense ledger table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Expense Ledger</CardTitle>
          <CardDescription>
            {filtered.length} expense{filtered.length === 1 ? '' : 's'} in the
            selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No expenses recorded in this period.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">GST (₹)</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((e, idx) => (
                      <TableRow key={`${e.spent_on}-${e.category}-${idx}`}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDateReadable(e.spent_on)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {categoryLabel(e.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {e.description ?? '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.vendor || '-'}
                        </TableCell>
                        <TableCell>
                          {paymentModeLabel(e.mode ?? 'other')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.gst_amount > 0 ? formatINR(e.gst_amount) : '₹0'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatINR(e.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
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
                label="expenses"
                testPrefix="expenses"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── 3. Payments & Refunds Tab ────────────────────────────────────────────────

function PaymentsTab({ p }: { p: PaymentsReport }) {
  const [selectedMode, setSelectedMode] = useState<string>('all');

  const filtered =
    selectedMode === 'all'
      ? p.rows
      : p.rows.filter((r) => r.mode === selectedMode);

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, selectedMode);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Offline Collected"
          value={formatINR(p.totalReceived)}
          highlight="green"
          sub={`${p.paymentCount} payment${p.paymentCount === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Refunded"
          value={formatINR(p.totalRefunded)}
          highlight={p.totalRefunded > 0 ? 'amber' : undefined}
          sub={`${p.refundCount} refund${p.refundCount === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Net Collected"
          value={formatINR(p.netCollected)}
          highlight={p.netCollected >= 0 ? 'green' : 'red'}
          sub="Received less refunds"
        />
        <KpiTile
          label="Top Payment Mode"
          value={p.topMode ? paymentModeLabel(p.topMode) : '-'}
          sub={
            p.paymentCount > 0
              ? `Avg. payment ${formatINR(p.avgPayment)}`
              : 'No offline payments'
          }
        />
      </div>

      {p.byMode.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Collection by Mode</CardTitle>
              <CardDescription>
                Share of offline payments across payment modes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <DonutChart
                  tooltipLabel="Collected"
                  slices={p.byMode.map((m) => ({
                    name: paymentModeLabel(m.mode),
                    value: m.amount,
                    key: m.mode,
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payment Mode Summary</CardTitle>
              <CardDescription>
                Transaction count and amount collected per mode
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.byMode.map((m) => (
                      <TableRow key={m.mode}>
                        <TableCell className="font-medium">
                          {paymentModeLabel(m.mode)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.count}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatINR(m.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.sharePct}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Filter pills */}
      {p.byMode.length > 1 ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setSelectedMode('all')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selectedMode === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:border-foreground/30',
            )}
          >
            All Modes ({p.rows.length})
          </button>
          {p.byMode.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => setSelectedMode(m.mode)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedMode === m.mode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:border-foreground/30',
              )}
            >
              {paymentModeLabel(m.mode)} ({m.count})
            </button>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Offline Payments</CardTitle>
          <CardDescription>
            Payments recorded directly in Ooruda for stays in this villa
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No offline payments recorded in this period.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Paid By</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDateReadable(r.paid_on)}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">
                          {r.booking_code ?? '-'}
                        </TableCell>
                        <TableCell>{r.payer_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {paymentModeLabel(r.mode)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {r.reference || '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatINR(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
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
                label="payments"
                testPrefix="payments"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── 4. GST Summary Tab ───────────────────────────────────────────────────────

function GstSummaryTab({ g }: { g: GstReport }) {
  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(g.months, g.months.length);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Taxable Stay Revenue"
          value={formatINR(g.taxableRevenue)}
          sub="Stay tariff + extra guests less discounts"
        />
        <KpiTile
          label="Output GST (Collected)"
          value={formatINR(g.outputGst)}
          highlight="amber"
          sub={`Gross stay value: ${formatINR(g.totalWithGst)}`}
        />
        <KpiTile
          label="Input GST (On Expenses)"
          value={formatINR(g.inputGst)}
          highlight="blue"
          sub={`Total expenses: ${formatINR(g.expenseAmount)}`}
        />
        <KpiTile
          label="Net GST Position"
          value={formatINR(g.netGstPayable)}
          highlight={g.netGstPayable > 0 ? 'amber' : 'green'}
          sub="Output GST minus Input GST"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly GST Breakdown</CardTitle>
          <CardDescription>
            Period-wise taxable revenue, output GST on stays, and input GST on
            expenses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Stays</TableHead>
                  <TableHead className="text-right">Nights</TableHead>
                  <TableHead className="text-right">Taxable (₹)</TableHead>
                  <TableHead className="text-right">Output GST (₹)</TableHead>
                  <TableHead className="text-right">Input GST (₹)</TableHead>
                  <TableHead className="text-right">Net GST (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">
                      {monthLabel(m.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.stays}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.nights}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(m.taxableRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatINR(m.outputGst)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(m.inputGst)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        m.netGstPayable > 0
                          ? 'text-warning'
                          : 'text-foreground',
                      )}
                    >
                      {formatINR(m.netGstPayable)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {g.months.length > 1 ? (
                <TableFooter>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Total</TableCell>
                    {/*
                      Counted over the whole period, not summed from the rows:
                      a stay across two months is in both month rows.
                    */}
                    <TableCell className="text-right tabular-nums">
                      {g.stays}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.nights}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(g.taxableRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(g.outputGst)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(g.inputGst)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(g.netGstPayable)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            fromIndex={fromIndex}
            toIndex={toIndex}
            onPageChange={setPage}
            label="months"
            testPrefix="gst-summary"
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Output GST is pro-rated across stay nights in the period. Input GST is
        taken from GST recorded on villa expenses.{' '}
        <span className="font-medium">Verify against your GSTIN filings.</span>
      </p>
    </div>
  );
}

// ── 5. Booking Channels Tab ──────────────────────────────────────────────────

function channelIcon(channel: string) {
  if (channel === 'airbnb')
    return <Building2 className="h-4 w-4 shrink-0" aria-hidden />;
  if (channel === 'online' || channel === 'website')
    return <Globe className="h-4 w-4 shrink-0" aria-hidden />;
  return <Star className="h-4 w-4 shrink-0" aria-hidden />;
}

function ChannelsTab({ lines }: { lines: ChannelLine[] }) {
  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(lines, lines.length);

  if (lines.length === 0) {
    return (
      <Card className="bg-card">
        <CardContent
          className="text-muted-foreground py-16 text-center text-sm"
          data-test={'villa-report-channels-empty'}
        >
          No stays in this period.
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = lines.reduce((s, c) => s + c.revenue, 0);
  const totalStays = lines.reduce((s, c) => s + c.stays, 0);
  const totalNights = lines.reduce((s, c) => s + c.nights, 0);
  const topChannel = lines[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Total Channel Revenue"
          value={formatINR(totalRevenue)}
          highlight="green"
          sub={`Across ${lines.length} booking channel${lines.length === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Booked Nights"
          value={String(totalNights)}
          sub={`${totalStays} stay${totalStays === 1 ? '' : 's'} in period`}
        />
        <KpiTile
          label="Top Channel"
          value={topChannel ? channelLabel(topChannel.channel) : '-'}
          sub={
            topChannel
              ? `${topChannel.sharePct}% of revenue (${formatINR(topChannel.revenue)})`
              : ''
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {lines.length >= 2 ? (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue Share</CardTitle>
              <CardDescription>
                Proportion of stay revenue by booking source
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-60" data-test={'villa-report-channel-chart'}>
                <DonutChart
                  tooltipLabel="Revenue"
                  scale="relative"
                  slices={lines.map((c) => ({
                    name: channelLabel(c.channel),
                    value: c.revenue,
                    key: c.channel,
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-col gap-3">
          {lines.map((c, i) => (
            <Card
              key={c.channel}
              className="bg-card"
              data-test={'villa-report-channel-card'}
            >
              <CardContent className="flex items-start gap-3 px-4 py-3.5">
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
                      className="h-full rounded-full"
                      style={{
                        width: `${c.sharePct}%`,
                        background: PIE_COLORS[i % PIE_COLORS.length],
                      }}
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
          <CardTitle className="text-base">Channel Breakdown</CardTitle>
          <CardDescription>
            Stays, nights sold, and revenue before GST by channel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table data-test={'villa-report-channels'}>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Stays</TableHead>
                  <TableHead className="text-right">Nights</TableHead>
                  <TableHead className="text-right">Revenue (₹)</TableHead>
                  <TableHead className="text-right">Share (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((c) => (
                  <TableRow key={c.channel}>
                    <TableCell className="font-medium">
                      {channelLabel(c.channel)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.stays}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.nights}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatINR(c.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.sharePct}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {lines.length > 1 ? (
                <TableFooter>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalStays}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalNights}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      100%
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            fromIndex={fromIndex}
            toIndex={toIndex}
            onPageChange={setPage}
            label="channels"
            testPrefix="channels"
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ── 6. Guest Directory Tab ───────────────────────────────────────────────────

function GuestsTab({ g }: { g: GuestsReport }) {
  const newGuests = g.guests - g.returning;
  const allGuests = g.allGuests ?? g.top;
  const [filter, setFilter] = useState<'all' | 'returning' | 'new'>(
    g.top.length > 0 ? 'returning' : 'all',
  );

  const filtered =
    filter === 'returning'
      ? allGuests.filter((x) => x.stays > 1)
      : filter === 'new'
        ? allGuests.filter((x) => x.stays === 1)
        : allGuests;

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          test="guests"
          label="Unique Guests"
          value={String(g.guests)}
          sub="Matched by phone number in period"
        />
        <KpiTile
          test="new-guests"
          label="First-Time Guests"
          value={String(newGuests)}
          sub="First stay at this villa"
        />
        <KpiTile
          test="returning"
          label="Returning Guests"
          value={String(g.returning)}
          highlight={g.returning > 0 ? 'green' : undefined}
          sub={`${g.returningPct}% repeat guest rate`}
        />
      </div>

      {/* Filter pills matching Ooruda DirectoryTab */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {(
          [
            { value: 'returning', label: `Returning (${g.returning})` },
            { value: 'all', label: `All Guests (${g.guests})` },
            { value: 'new', label: `First-Time (${newGuests})` },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:border-foreground/30',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Guest History</CardTitle>
          <CardDescription>
            Lifetime stays, nights, and taxable revenue for guests who stayed in
            this period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p
              className="text-muted-foreground py-12 text-center text-sm"
              data-test={'villa-report-guests-empty'}
            >
              {filter === 'returning'
                ? 'No returning guests in this period yet.'
                : 'No guests found in this period.'}
            </p>
          ) : (
            <div data-test={'villa-report-guests'}>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Stays</TableHead>
                      <TableHead className="text-right">Nights</TableHead>
                      <TableHead className="text-right">
                        Lifetime Revenue (₹)
                      </TableHead>
                      <TableHead className="text-right">Last Stay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((x, idx) => (
                      <TableRow key={`${x.name}-${x.phone ?? idx}`}>
                        <TableCell className="font-medium">{x.name}</TableCell>
                        <TableCell className="tabular-nums">
                          {x.phone || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              x.stays > 1
                                ? 'border-success/40 text-success'
                                : 'text-muted-foreground'
                            }
                          >
                            {x.stays > 1 ? `Returning (×${x.stays})` : 'New'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {x.stays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {x.nights}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatINR(x.revenue)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {formatDateReadable(x.lastStay)}
                        </TableCell>
                      </TableRow>
                    ))}
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
                label="guests"
                testPrefix="guests"
              />
            </div>
          )}
          <p className="text-muted-foreground mt-4 border-t pt-3 text-xs">
            Guests with the same phone number are counted as one person. Stays,
            nights, and revenue include every visit to this villa, not just this
            period.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
