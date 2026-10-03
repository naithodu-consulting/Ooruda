import Link from 'next/link';

import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Button } from '@kit/ui/button';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';
import { cn } from '@kit/ui/utils';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { type Block, listBlocks } from '~/lib/villa-db/blocks';
import { type SiteBooking, listBookings } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';
import {
  blockNoteForDisplay,
  buildAgenda,
  buildMonth,
  gridRange,
  monthOccupancy,
  parseMonth,
  shiftMonth,
} from '~/lib/villa/calendar';
import { selectVillaProperty } from '~/lib/villa/properties';

import { MonthNav } from '../_components/month-nav';
import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { NewBookingDialog } from '../bookings/_components/new-booking-dialog';
import { BlockDatesDialog } from './_components/block-dates-dialog';
import { CalendarView } from './_components/calendar-view';

export const metadata = { title: 'Calendar' };

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ month?: string; property?: string }>;
}

export default async function CalendarPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const today = todayIst();
  const month = parseMonth(sp.month, today);

  const { accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { properties, property } = await selectVillaProperty(
    accountId,
    sp.property,
    { requireSite: true },
  );

  const base = pathsConfig.app.accountVillaCalendar.replace(
    '[account]',
    account,
  );
  const hrefFor = (m: string, propertyId = property?.id) => {
    const q = new URLSearchParams({ month: m });
    if (propertyId && properties.length > 1) q.set('property', propertyId);
    return `${base}?${q.toString()}`;
  };

  let bookings: SiteBooking[] = [];
  let blocks: Block[] = [];
  let siteError: string | null = null;

  if (property) {
    try {
      const site = await getVillaSite(accountId, property.id);
      const { from, to } = gridRange(month);

      [bookings, blocks] = await Promise.all([
        listBookings(site, from, to),
        listBlocks(site, from, to),
      ]);
    } catch (error) {
      if (!isVillaDbError(error)) throw error;
      siteError = error.message;
    }
  }

  const occupancy = monthOccupancy(month, bookings, blocks);
  const bookingHref = property
    ? `${pathsConfig.app.accountVillaBookings.replace('[account]', account)}/[id]?property=${property.id}`
    : '';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.calendar'} />}
        description={<AppBreadcrumbs />}
      >
        {property && !siteError ? (
          <div className="flex flex-wrap gap-2">
            <BlockDatesDialog accountId={accountId} propertyId={property.id} />
            <NewBookingDialog
              account={account}
              accountId={accountId}
              propertyId={property.id}
            />
          </div>
        ) : null}
      </TeamAccountLayoutPageHeader>

      <div className="flex max-w-6xl flex-col gap-4">
        {!property ? (
          <Alert data-test={'villa-calendar-no-property'}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>No booking site connected</AlertTitle>
            <AlertDescription>
              The calendar appears here once Ooruda support connects your villa
              to its booking site.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {properties.length > 1 ? (
              <nav
                aria-label="Villa"
                className="flex flex-wrap gap-2"
                data-test={'villa-calendar-properties'}
              >
                {properties.map((p) => (
                  <Link
                    key={p.id}
                    href={hrefFor(month, p.id)}
                    aria-current={p.id === property.id ? 'page' : undefined}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm',
                      p.id === property.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-muted',
                    )}
                  >
                    {p.name}
                  </Link>
                ))}
              </nav>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MonthNav
                  month={month}
                  prevHref={hrefFor(shiftMonth(month, -1))}
                  nextHref={hrefFor(shiftMonth(month, 1))}
                  data-test-prev="villa-calendar-prev"
                  data-test-month="villa-calendar-month"
                  data-test-next="villa-calendar-next"
                />
                {month !== today.slice(0, 7) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link href={hrefFor(today.slice(0, 7))} scroll={false} />
                    }
                    data-test={'villa-calendar-today'}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Jump to today
                  </Button>
                ) : null}
              </div>

              {!siteError ? (
                <p
                  className="text-muted-foreground text-sm"
                  data-test={'villa-calendar-occupancy'}
                >
                  {occupancy.booked} of {occupancy.nights} nights booked
                  {occupancy.blocked ? `, ${occupancy.blocked} blocked` : ''}
                </p>
              ) : null}
            </div>

            {siteError ? (
              <Alert
                variant="destructive"
                data-test={'villa-calendar-site-error'}
              >
                <CircleAlert className="h-4 w-4" />
                <AlertTitle>Booking site unavailable</AlertTitle>
                <AlertDescription>{siteError}</AlertDescription>
              </Alert>
            ) : (
              <CalendarView
                accountId={accountId}
                propertyId={property.id}
                bookingHref={bookingHref}
                weeks={buildMonth(month, bookings, blocks, today)}
                agenda={buildAgenda(month, bookings, blocks)}
                blocks={blocks.map((b) => ({
                  id: b.id,
                  startDate: b.startDate,
                  endDate: b.endDate,
                  reason: b.reason,
                  notes: blockNoteForDisplay(b.notes),
                }))}
              />
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}
