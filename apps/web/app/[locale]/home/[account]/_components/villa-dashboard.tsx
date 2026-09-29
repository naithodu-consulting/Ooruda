import { Suspense } from 'react';

import Link from 'next/link';

import { Home, UserPlus } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from './team-account-layout-page-header';
import { VillaMonthKpis } from './villa-month-kpis';
import { VillaSiteStatus } from './villa-site-status';
import { VillaToday } from './villa-today';

/**
 * Villa workspace home: today's arrivals and departures (live from the
 * booking site), this month's figures (from the bookings mirror), and the
 * workspace/site status. With several villas it shows the first connected
 * one; a villa switcher comes with reports (M6).
 */
export async function VillaDashboard({ account }: { account: string }) {
  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { property } = await selectVillaProperty(accountId, undefined, {
    requireSite: true,
  });

  const membersPath = pathsConfig.app.accountMembers.replace(
    '[account]',
    account,
  );

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.dashboard.title'} />}
        description={<AppBreadcrumbs />}
      />

      <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
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

        <Card className="bg-card" data-test={'villa-dashboard-setup'}>
          <CardHeader>
            <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-full">
              <Home className="h-5 w-5" />
            </div>

            <CardTitle>
              <Trans i18nKey={'villa.dashboard.setupTitle'} />
            </CardTitle>

            <CardDescription>
              <Trans i18nKey={'villa.dashboard.setupDescription'} />
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              <Trans i18nKey={'villa.dashboard.signedInAs'} />{' '}
              <span
                className="text-foreground font-medium"
                data-test={'villa-dashboard-role'}
              >
                <Trans i18nKey={`common.roles.${role}.label`} />
              </span>
            </p>

            {role === 'villa_owner' ? (
              <Button
                className="w-full sm:w-auto"
                data-test={'villa-dashboard-invite-manager'}
                nativeButton={false}
                render={<Link href={membersPath} />}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                <Trans i18nKey={'villa.dashboard.inviteManager'} />
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <VillaSiteStatus accountId={accountId} />
        </Suspense>
      </div>
    </PageBody>
  );
}
