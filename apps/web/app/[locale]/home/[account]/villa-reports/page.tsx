import { Suspense } from 'react';

import { CircleAlert } from 'lucide-react';

import { getLogger } from '@kit/shared/logger';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';
import { todayIst } from '~/lib/villa-db/dates';
import { refreshMirrorForRead } from '~/lib/villa/mirror';
import {
  type VillaPropertySummary,
  selectVillaProperty,
} from '~/lib/villa/properties';
import { type ReportRange, resolveReportRange } from '~/lib/villa/reports';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSwitcher } from '../_components/villa-switcher';
import { type ReportTab, ReportsView } from './_components/reports-view';
import {
  REPORT_TABS,
  VillaReportLoadError,
  loadVillaReportData,
} from './_lib/server/load-report';

export const metadata = { title: 'Reports' };

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

export default async function VillaReportsPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const today = todayIst();
  const tab: ReportTab = REPORT_TABS.includes(sp.tab as ReportTab)
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
      <Suspense key={property.id} fallback={<ReportSkeleton />}>
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

  // The first PDF export in a process pays ~1s to parse the fonts and start
  // the layout engine. Started (not awaited) as the report itself loads, that
  // cost is spent while the reader is still looking at the screen rather than
  // after they press Download. Memoised, so later visits cost nothing.
  void loadPdfRenderer().catch(() => undefined);

  // Refresh the copy of the bookings BEFORE reading it, so the figures below
  // are current on this load. Bounded: see refreshMirrorForRead.
  const { syncedAt } = await refreshMirrorForRead(accountId, property.id);

  // The same loader backs the PDF export, so a downloaded report can never
  // disagree with the screen it was started from.
  const report = await loadVillaReportData({
    propertyId: property.id,
    tab,
    range,
  }).catch(async (error: unknown) => {
    if (error instanceof VillaReportLoadError) {
      (await getLogger()).error(
        { propertyId: property.id, code: error.code },
        'villa reports load failed',
      );
      throw new Error('Could not load the report. Refresh to try again.');
    }
    throw error;
  });

  return (
    <ReportsView
      account={account}
      tab={tab}
      range={range}
      today={today}
      propertyName={property.name}
      propertyId={linkProperty ? property.id : null}
      accountId={accountId}
      exportPropertyId={property.id}
      syncedAt={syncedAt}
      overview={report.overview}
      expenses={report.expenses}
      payments={report.payments}
      gst={report.gst}
      channels={report.channels}
      guests={report.guests}
    />
  );
}
