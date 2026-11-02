import Link from 'next/link';

import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { formatDateReadable } from '~/lib/format-date';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { type Block, listBlocks } from '~/lib/villa-db/blocks';
import {
  type SiteBooking,
  listBookings,
  listChannelLinkedBookings,
} from '~/lib/villa-db/bookings';
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
import { linkChannelStays } from '~/lib/villa/channel-link';
import {
  type IcalFeedStatusSummary,
  getIcalFeedsStatus,
} from '~/lib/villa/ical-sync';
import { selectVillaProperty } from '~/lib/villa/properties';
import { loadVillaAccountSettings } from '~/lib/villa/settings';

import { MonthNav } from '../_components/month-nav';
import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSwitcher } from '../_components/villa-switcher';
import { NewBookingDialog } from '../bookings/_components/new-booking-dialog';
import { BlockDatesDialog } from './_components/block-dates-dialog';
import { CalendarView } from './_components/calendar-view';
import { SyncIcalButton } from './_components/sync-ical-button';

export const metadata = { title: 'Calendar' };

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ month?: string; property?: string }>;
}

export default async function CalendarPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const today = todayIst();
  const month = parseMonth(sp.month, today);

  const { accountId, role } = await requireRole(account, VILLA_ROLES, 'villa');

  // The cutoff is Ooruda's setting, mirrored to the booking site. The site's
  // check_availability() reports every night past it as unavailable, so the
  // calendar has to show it: without it, an operator sees those nights as free
  // and blocks or unblocks them with no effect anywhere.
  //
  // It needs only the account id, so it is read alongside the property rather
  // than after it.
  const [{ properties, property }, settings] = await Promise.all([
    selectVillaProperty(accountId, sp.property, { requireSite: true }),
    loadVillaAccountSettings(accountId),
  ]);

  const bookingCutoff = settings.bookingCutoffDate;
  const canOverrideCutoff = role === 'villa_admin';

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
  let icalStatus: IcalFeedStatusSummary = {
    lastSyncedAt: null,
    lastStatus: null,
  };
  let siteError: string | null = null;
  let recordedByBlock = new Map<string, string>();

  if (property) {
    try {
      const site = await getVillaSite(accountId, property.id);
      const { from, to } = gridRange(month);

      const [bookingList, blockList, status, linkedBookings] =
        await Promise.all([
          listBookings(site, from, to),
          listBlocks(site, from, to),
          getIcalFeedsStatus(site),
          listChannelLinkedBookings(site, { from, to }),
        ]);

      bookings = bookingList;
      icalStatus = status;

      // A channel stay that has been filled in is drawn once, as its booking.
      // The block still holds the nights on the site — it is just not a
      // second thing on the calendar saying the same nights are taken.
      const linkResult = linkChannelStays({
        blocks: blockList,
        bookings: [...bookingList, ...linkedBookings],
        today,
      });

      blocks = blockList.filter((b) => !linkResult.enrichedBlockIds.has(b.id));

      recordedByBlock = new Map(
        [...linkResult.blockIdByBooking].map(([bookingId, blockId]) => [
          blockId,
          bookingId,
        ]),
      );
    } catch (error) {
      if (!isVillaDbError(error)) throw error;
      siteError = error.message;
    }
  }

  const occupancy = monthOccupancy(month, bookings, blocks, bookingCutoff);
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
          <div className="flex flex-wrap items-center gap-2">
            <SyncIcalButton
              accountId={accountId}
              propertyId={property.id}
              lastSyncedAt={icalStatus.lastSyncedAt}
              lastStatus={icalStatus.lastStatus}
            />
            <BlockDatesDialog
              accountId={accountId}
              propertyId={property.id}
              bookingCutoffDate={bookingCutoff}
            />
            <NewBookingDialog
              account={account}
              accountId={accountId}
              propertyId={property.id}
              bookingCutoffDate={bookingCutoff}
              canOverrideCutoff={canOverrideCutoff}
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
              <div data-test={'villa-calendar-properties'}>
                <VillaSwitcher
                  properties={properties.map((p) => ({
                    id: p.id,
                    name: p.name,
                  }))}
                  current={property.id}
                />
              </div>
            ) : null}

            {bookingCutoff ? (
              <Alert data-test={'villa-calendar-cutoff'}>
                <CircleAlert className="h-4 w-4" />
                <AlertTitle>
                  Closed for booking after {formatDateReadable(bookingCutoff)}
                </AlertTitle>
                <AlertDescription>
                  The website and booking channels take no check-in after this
                  date, so those nights need no block, and unblocking them
                  changes nothing.{' '}
                  {canOverrideCutoff
                    ? 'You can still record a booking past it yourself.'
                    : 'Only a villa admin can record a booking past it.'}{' '}
                  Change the date in{' '}
                  <Link
                    href={`${pathsConfig.app.accountVillaSettings.replace('[account]', account)}?tab=cutoff`}
                    className="hover:text-foreground font-medium underline"
                  >
                    Settings
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <MonthNav
                month={month}
                prevHref={hrefFor(shiftMonth(month, -1))}
                nextHref={hrefFor(shiftMonth(month, 1))}
                todayHref={hrefFor(today.slice(0, 7))}
                todayLabel="Today"
                data-test-prev="villa-calendar-prev"
                data-test-month="villa-calendar-month"
                data-test-next="villa-calendar-next"
                data-test-today="villa-calendar-today"
              />

              {!siteError ? (
                <div
                  className="bg-card text-muted-foreground inline-flex min-h-9 flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-1.5 text-xs shadow-2xs"
                  data-test={'villa-calendar-occupancy'}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="bg-primary/40 border-primary/70 h-2.5 w-2.5 shrink-0 rounded-full border" />
                    <span>
                      <strong className="text-foreground font-semibold tabular-nums">
                        {occupancy.booked}
                      </strong>{' '}
                      of{' '}
                      <span className="tabular-nums">{occupancy.nights}</span>{' '}
                      nights booked
                    </span>
                  </span>
                  {occupancy.blocked ? (
                    <>
                      <span className="text-border" aria-hidden>
                        ·
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="bg-muted-foreground/25 border-muted-foreground/50 h-2.5 w-2.5 shrink-0 rounded-full border" />
                        <span>
                          <strong className="text-foreground font-semibold tabular-nums">
                            {occupancy.blocked}
                          </strong>{' '}
                          blocked
                        </span>
                      </span>
                    </>
                  ) : null}
                  {occupancy.closed ? (
                    <>
                      <span className="text-border" aria-hidden>
                        ·
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="bg-destructive/20 border-destructive/40 h-2.5 w-2.5 shrink-0 rounded-full border" />
                        <span>
                          <strong className="text-foreground font-semibold tabular-nums">
                            {occupancy.closed}
                          </strong>{' '}
                          closed for booking
                        </span>
                      </span>
                    </>
                  ) : null}
                </div>
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
                account={account}
                accountId={accountId}
                propertyId={property.id}
                bookingHref={bookingHref}
                bookingCutoff={bookingCutoff}
                weeks={buildMonth(
                  month,
                  bookings,
                  blocks,
                  today,
                  bookingCutoff,
                )}
                agenda={buildAgenda(month, bookings, blocks)}
                blocks={blocks.map((b) => ({
                  id: b.id,
                  startDate: b.startDate,
                  endDate: b.endDate,
                  reason: b.reason,
                  notes: blockNoteForDisplay(b.notes),
                  source: b.source,
                  channelName: b.channelName,
                  feedId: b.feedId,
                  externalUid: b.externalUid,
                  recordedBookingId: recordedByBlock.get(b.id) ?? null,
                }))}
              />
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}
