import { Suspense } from 'react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from './team-account-layout-page-header';
import { VillaMonthKpis } from './villa-month-kpis';
import { VillaSwitcher } from './villa-switcher';
import { VillaToday } from './villa-today';

/**
 * Villa workspace home: today's arrivals and departures (live from the
 * booking site) and this month's figures (from the bookings mirror). With
 * several villas it shows the first connected one, or the one picked with the
 * villa switcher (?property=). The workspace card lives on the Bookings page
 * and the booking-site connection on Settings.
 */
export async function VillaDashboard({
  account,
  property: requested,
}: {
  account: string;
  property?: string;
}) {
  const { accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { properties, property } = await selectVillaProperty(
    accountId,
    requested,
    {
      requireSite: true,
    },
  );

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.dashboard.title'} />}
        description={<AppBreadcrumbs />}
      />

      <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
        {property && properties.length > 1 ? (
          <div className="lg:col-span-2">
            <VillaSwitcher
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
              current={property.id}
            />
          </div>
        ) : null}
        {property ? (
          <>
            <Suspense
              fallback={<Skeleton className="h-40 rounded-xl lg:col-span-2" />}
            >
              <VillaToday
                account={account}
                accountId={accountId}
                propertyId={property.id}
              />
            </Suspense>
            <Suspense
              fallback={<Skeleton className="h-28 rounded-xl lg:col-span-2" />}
            >
              <VillaMonthKpis accountId={accountId} propertyId={property.id} />
            </Suspense>
          </>
        ) : null}
      </div>
    </PageBody>
  );
}
