import { after } from 'next/server';

import { CircleAlert } from 'lucide-react';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { MIRROR_STALE_MS, syncPropertyMirror } from '~/lib/villa/mirror';
import { selectVillaProperty } from '~/lib/villa/properties';
import {
  type ReportStay,
  buildChannels,
  buildGuests,
  buildOverview,
  resolveReportRange,
} from '~/lib/villa/reports';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { type ReportTab, ReportsView } from './_components/reports-view';

export const metadata = { title: 'Reports' };

const TABS: ReportTab[] = ['overview', 'channels', 'guests'];

const STAY_COLUMNS =
  'status, booking_kind, channel, check_in, check_out, nights, base_amount, extra_guest_amount, tax_amount, guest_name, guest_phone, booking_code';

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

  const client = getSupabaseServerClient();
  const end = addDays(range.to, 1);

  const [staysResult, expensesResult, historyResult, stateResult] =
    await Promise.all([
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
          .select('spent_on, category, amount, gst_amount')
          .eq('property_id', property.id)
          .gte('spent_on', range.from)
          .lte('spent_on', range.to)
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
      client
        .from('villa_mirror_sync_state')
        .select('last_synced_at')
        .eq('property_id', property.id)
        .maybeSingle(),
    ]);

  const error =
    staysResult.error ??
    expensesResult.error ??
    historyResult.error ??
    stateResult.error;

  if (error) {
    (await getLogger()).error(
      { propertyId: property.id, code: error.code },
      'villa reports load failed',
    );
    throw new Error('Could not load the report. Refresh to try again.');
  }

  // Keep the copy of the bookings fresh for next time, without waiting.
  const syncedAt = stateResult.data?.last_synced_at ?? null;

  if (!syncedAt || Date.now() - Date.parse(syncedAt) > MIRROR_STALE_MS) {
    after(() =>
      syncPropertyMirror(accountId, property.id).catch(() => undefined),
    );
  }

  const stays = (staysResult.data ?? []).map(toStay);
  const expenses = (expensesResult.data ?? []).map((e) => ({
    spent_on: e.spent_on,
    category: e.category,
    amount: Number(e.amount),
    gst_amount: Number(e.gst_amount),
  }));

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.reports'} />}
        description={<AppBreadcrumbs />}
      />

      <ReportsView
        account={account}
        tab={tab}
        range={range}
        today={today}
        propertyName={property.name}
        propertyId={properties.length > 1 ? property.id : null}
        syncedAt={syncedAt}
        overview={buildOverview(range, stays, expenses)}
        channels={tab === 'channels' ? buildChannels(range, stays) : []}
        guests={
          tab === 'guests'
            ? buildGuests(range, (historyResult.data ?? []).map(toStay))
            : null
        }
      />
    </PageBody>
  );
}
