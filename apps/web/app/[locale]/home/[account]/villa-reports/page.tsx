import { Suspense } from 'react';

import { CircleAlert } from 'lucide-react';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { refreshMirrorForRead } from '~/lib/villa/mirror';
import {
  type VillaPropertySummary,
  selectVillaProperty,
} from '~/lib/villa/properties';
import {
  type ReportRange,
  type ReportStay,
  buildChannels,
  buildGstReport,
  buildGuests,
  buildOverview,
  buildPaymentsReport,
  resolveReportRange,
} from '~/lib/villa/reports';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSwitcher } from '../_components/villa-switcher';
import { type ReportTab, ReportsView } from './_components/reports-view';

export const metadata = { title: 'Reports' };

const TABS: ReportTab[] = [
  'overview',
  'expenses',
  'payments',
  'gst_summary',
  'channels',
  'guests',
];

const STAY_COLUMNS =
  'status, booking_kind, channel, check_in, check_out, nights, base_amount, extra_guest_amount, discount_amount, tax_amount, guest_name, guest_phone, booking_code';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
    property?: string;
  }>;
}

/** PostgREST returns at most 1000 rows per request: page until done. */
const PAGE = 1000;
const MAX_ROWS = 100_000;

async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const rows: T[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);

    if (error) return { data: rows, error };

    rows.push(...(data ?? []));

    if (!data || data.length < PAGE) return { data: rows, error: null };
  }

  return {
    data: rows,
    error: { message: `report exceeds ${MAX_ROWS} rows` },
  };
}

const toStay = (r: Record<string, unknown>): ReportStay => ({
  ...(r as unknown as ReportStay),
  base_amount: Number(r.base_amount),
  discount_amount: Number(r.discount_amount ?? 0),
  extra_guest_amount: Number(r.extra_guest_amount),
  tax_amount: Number(r.tax_amount),
});

export default async function VillaReportsPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const today = todayIst();
  const tab: ReportTab = TABS.includes(sp.tab as ReportTab)
    ? (sp.tab as ReportTab)
    : 'overview';
  const range = resolveReportRange(
    { preset: sp.range, from: sp.from, to: sp.to },
    today,
  );

  const { accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { properties, property } = await selectVillaProperty(
    accountId,
    sp.property,
  );

  if (!property) {
    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey={'villa.nav.reports'} />}
          description={<AppBreadcrumbs />}
        />
        <Alert data-test={'villa-reports-no-property'}>
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>No villa set up yet</AlertTitle>
          <AlertDescription>
            Reports appear once Ooruda support sets up your villa.
          </AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.reports'} />}
        description={<AppBreadcrumbs />}
      >
        <VillaSwitcher
          properties={properties.map((p) => ({ id: p.id, name: p.name }))}
          current={property.id}
        />
      </TeamAccountLayoutPageHeader>

      {/*
        The figures come from the bookings mirror, which is refreshed from the
        booking site before it is read. That refresh is bounded but can still
        take a couple of seconds, so it must not hold up the page: the header
        and the villa switcher paint at once and the report streams in.
      */}
      <Suspense
        key={`${property.id}-${tab}-${range.from}-${range.to}`}
        fallback={<ReportSkeleton />}
      >
        <ReportBody
          account={account}
          tab={tab}
          range={range}
          today={today}
          property={property}
          // Links carry ?property= only when there is a choice to preserve.
          linkProperty={properties.length > 1}
        />
      </Suspense>
    </PageBody>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-test={'villa-reports-loading'}>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ReportBody({
  account,
  tab,
  range,
  today,
  property,
  linkProperty,
}: {
  account: string;
  tab: ReportTab;
  range: ReportRange;
  today: string;
  property: VillaPropertySummary;
  linkProperty: boolean;
}) {
  const accountId = property.accountId;
  const client = getSupabaseServerClient();
  const end = addDays(range.to, 1);

  // Refresh the copy of the bookings BEFORE reading it, so the figures below
  // are current on this load. Bounded: see refreshMirrorForRead.
  const { syncedAt } = await refreshMirrorForRead(accountId, property.id);

  const [
    staysResult,
    expensesResult,
    historyResult,
    paymentsResult,
    refundsResult,
  ] = await Promise.all([
    fetchAll((a, b) =>
      client
        .from('villa_bookings_mirror')
        .select(STAY_COLUMNS)
        .eq('property_id', property.id)
        .in('status', ['confirmed', 'completed'])
        .lt('check_in', end)
        .gt('check_out', range.from)
        .order('site_booking_id')
        .range(a, b),
    ),
    fetchAll((a, b) =>
      client
        .from('villa_expenses')
        .select(
          'spent_on, category, amount, gst_amount, description, vendor, mode, invoice_no',
        )
        .eq('property_id', property.id)
        .gte('spent_on', range.from)
        .lte('spent_on', range.to)
        .order('spent_on', { ascending: false })
        // fetchAll pages with .range(): spent_on is not unique, so without a
        // tiebreaker rows can shift between pages and be dropped or doubled.
        .order('id')
        .range(a, b),
    ),
    // Returning guests need every past stay, only on that tab.
    tab === 'guests'
      ? fetchAll((a, b) =>
          client
            .from('villa_bookings_mirror')
            .select(STAY_COLUMNS)
            .eq('property_id', property.id)
            .in('status', ['confirmed', 'completed'])
            .lt('check_in', end)
            .order('site_booking_id')
            .range(a, b),
        )
      : Promise.resolve({ data: [], error: null }),
    tab === 'payments'
      ? fetchAll((a, b) =>
          client
            .from('villa_booking_payments')
            .select(
              'id, paid_on, mode, amount, reference, payer_name, booking_code',
            )
            .eq('property_id', property.id)
            .is('voided_at', null)
            .gte('paid_on', range.from)
            .lte('paid_on', range.to)
            .order('paid_on', { ascending: false })
            .order('id')
            .range(a, b),
        )
      : Promise.resolve({ data: [], error: null }),
    tab === 'payments'
      ? fetchAll((a, b) =>
          client
            .from('villa_refunds')
            .select('id, refunded_on, mode, amount, reason')
            .eq('property_id', property.id)
            .neq('status', 'failed')
            .gte('refunded_on', range.from)
            .lte('refunded_on', range.to)
            .order('refunded_on', { ascending: false })
            .order('id')
            .range(a, b),
        )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error =
    staysResult.error ??
    expensesResult.error ??
    historyResult.error ??
    paymentsResult.error ??
    refundsResult.error;

  if (error) {
    (await getLogger()).error(
      { propertyId: property.id, code: error.code },
      'villa reports load failed',
    );
    throw new Error('Could not load the report. Refresh to try again.');
  }

  const stays = (staysResult.data ?? []).map(toStay);
  const expenses = (expensesResult.data ?? []).map((e) => ({
    spent_on: e.spent_on,
    category: e.category,
    amount: Number(e.amount),
    gst_amount: Number(e.gst_amount),
    description: e.description,
    vendor: e.vendor,
    mode: e.mode,
    invoice_no: e.invoice_no,
  }));
  const payments = (paymentsResult.data ?? []).map((p) => ({
    id: p.id,
    paid_on: p.paid_on,
    mode: p.mode,
    amount: Number(p.amount),
    reference: p.reference,
    payer_name: p.payer_name,
    booking_code: p.booking_code,
  }));
  const refunds = (refundsResult.data ?? []).map((r) => ({
    id: r.id,
    refunded_on: r.refunded_on,
    mode: r.mode,
    amount: Number(r.amount),
    reason: r.reason,
  }));

  return (
    <ReportsView
      account={account}
      tab={tab}
      range={range}
      today={today}
      propertyName={property.name}
      propertyId={linkProperty ? property.id : null}
      syncedAt={syncedAt}
      overview={buildOverview(range, stays, expenses)}
      expenses={expenses}
      payments={
        tab === 'payments'
          ? buildPaymentsReport(range, payments, refunds)
          : null
      }
      gst={
        tab === 'gst_summary' ? buildGstReport(range, stays, expenses) : null
      }
      channels={tab === 'channels' ? buildChannels(range, stays) : []}
      guests={
        tab === 'guests'
          ? buildGuests(range, (historyResult.data ?? []).map(toStay), 1000)
          : null
      }
    />
  );
}
