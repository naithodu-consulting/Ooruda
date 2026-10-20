import { Suspense } from 'react';

import Link from 'next/link';

import { Calendar, Home, Plus, Receipt, UserPlus } from 'lucide-react';

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
import { VillaSwitcher } from './villa-switcher';
import { VillaToday } from './villa-today';

/**
 * Villa workspace home: today's arrivals and departures (live from the
 * booking site), this month's figures (from the bookings mirror), and the
 * workspace/site status. With several villas it shows the first connected
 * one, or the one picked with the villa switcher (?property=).
 */
export async function VillaDashboard({
  account,
  property: requested,
}: {
  account: string;
  property?: string;
}) {
  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { properties, property } = await selectVillaProperty(
    accountId,
    requested,
    {
      requireSite: true,
    },
  );

  const membersPath = pathsConfig.app.accountMembers.replace(
    '[account]',
    account,
  );
  const bookingsPath = pathsConfig.app.accountVillaBookings.replace(
    '[account]',
    account,
  );
  const calendarPath = pathsConfig.app.accountVillaCalendar.replace(
    '[account]',
    account,
  );
  const expensesPath = pathsConfig.app.accountVillaExpenses.replace(
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

        <Card className="bg-card" data-test={'villa-dashboard-setup'}>
          <CardHeader>
            <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-full">
              <Home className="h-5 w-5" />
            </div>

            <CardTitle>
              <Trans i18nKey={'villa.dashboard.setupTitle'} />
            </CardTitle>

            <CardDescription>
              <Trans
                i18nKey={
                  role === 'villa_admin'
                    ? 'villa.dashboard.setupDescriptionOwner'
                    : 'villa.dashboard.setupDescriptionManager'
                }
              />
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={bookingsPath} />}
                data-test={'villa-dashboard-quick-booking'}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                <Trans i18nKey={'villa.dashboard.newBooking'} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={calendarPath} />}
                data-test={'villa-dashboard-quick-calendar'}
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                <Trans i18nKey={'villa.dashboard.calendar'} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={expensesPath} />}
                data-test={'villa-dashboard-quick-expense'}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                <Trans i18nKey={'villa.dashboard.addExpense'} />
              </Button>
            </div>

            <div className="flex flex-col gap-3 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                <Trans i18nKey={'villa.dashboard.signedInAs'} />{' '}
                <span
                  className="text-foreground font-medium"
                  data-test={'villa-dashboard-role'}
                >
                  <Trans i18nKey={`common.roles.${role}.label`} />
                </span>
              </p>

              {role === 'villa_admin' ? (
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  data-test={'villa-dashboard-invite-manager'}
                  nativeButton={false}
                  render={<Link href={membersPath} />}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  <Trans i18nKey={'villa.dashboard.inviteManager'} />
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <VillaSiteStatus accountId={accountId} />
        </Suspense>
      </div>
    </PageBody>
  );
}
