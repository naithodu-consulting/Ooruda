import { redirect } from 'next/navigation';

import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { type Block, listBlocks } from '~/lib/villa-db/blocks';
import { normalizeBookingCode } from '~/lib/villa-db/booking-code';
import {
  type BookingView,
  type SiteBooking,
  getBookingByCode,
  listBookingsByView,
  searchBookings,
} from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { blockNoteForDisplay } from '~/lib/villa/calendar';
import {
  type IcalFeedStatusSummary,
  getIcalFeedsStatus,
} from '~/lib/villa/ical-sync';
import { selectVillaProperty } from '~/lib/villa/properties';
import { loadVillaAccountSettings } from '~/lib/villa/settings';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { BlockedDatesView } from '../blocked-dates/_components/blocked-dates-view';
import { SyncIcalButton } from '../calendar/_components/sync-ical-button';
import { BookingsList } from './_components/bookings-list';
import { BookingsToolbar, type AllView } from './_components/bookings-toolbar';
import { NewBookingDialog } from './_components/new-booking-dialog';

export const metadata = { title: 'Bookings' };

const BOOKING_VIEWS: BookingView[] = [
  'upcoming',
  'in_house',
  'past',
  'cancelled',
];
const LIST_LIMIT = 100;

const BLOCKED_SOURCES = ['all', 'manual', 'channel'] as const;
type BlockedSourceFilter = (typeof BLOCKED_SOURCES)[number];

const BLOCKED_VIEWS = ['upcoming', 'past', 'all'] as const;
type BlockedView = (typeof BLOCKED_VIEWS)[number];

const PAST_DAYS = 365;
const FUTURE_DAYS = 730;

function blockWindowFor(bview: BlockedView, today: string) {
  switch (bview) {
    case 'past':
      return { from: addDays(today, -PAST_DAYS), to: today };
    case 'all':
      return {
        from: addDays(today, -PAST_DAYS),
        to: addDays(today, FUTURE_DAYS),
      };
    default:
      return { from: today, to: addDays(today, FUTURE_DAYS) };
  }
}

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    view?: string;
    q?: string;
    property?: string;
    bview?: string;
    source?: string;
    reason?: string;
  }>;
}

export default async function BookingsPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);

  const isBlocked = sp.view === 'blocked';
  const view: AllView = isBlocked
    ? 'blocked'
    : BOOKING_VIEWS.includes(sp.view as BookingView)
      ? (sp.view as BookingView)
      : 'upcoming';
  const q = sp.q?.trim() ?? '';

  const bview: BlockedView = BLOCKED_VIEWS.includes(sp.bview as BlockedView)
    ? (sp.bview as BlockedView)
    : 'upcoming';
  const source: BlockedSourceFilter = BLOCKED_SOURCES.includes(
    sp.source as BlockedSourceFilter,
  )
    ? (sp.source as BlockedSourceFilter)
    : 'all';
  const reason = sp.reason && /^[a-z_]+$/.test(sp.reason) ? sp.reason : 'all';

  const { accountId, role } = await requireRole(account, VILLA_ROLES, 'villa');

  // Both need only the account id, so neither waits for the other: on a
  // remote database this was two serial round trips before the page could
  // even start reading the booking site.
  const [{ properties, property }, settings] = await Promise.all([
    selectVillaProperty(accountId, sp.property, { requireSite: true }),
    loadVillaAccountSettings(accountId),
  ]);

  const base = pathsConfig.app.accountVillaBookings.replace(
    '[account]',
    account,
  );

  // The booking cutoff drives the date picker and the blocked list.
  const bookingCutoffDate = settings.bookingCutoffDate;

  let bookings: SiteBooking[] = [];
  let blocks: Block[] = [];
  let icalStatus: IcalFeedStatusSummary = {
    lastSyncedAt: null,
    lastStatus: null,
  };
  let siteError: string | null = null;
  let jumpTo: string | null = null;
  const today = todayIst();

  if (property) {
    try {
      const site = await getVillaSite(accountId, property.id);

      if (isBlocked) {
        const { from, to } = blockWindowFor(bview, today);
        [blocks, icalStatus] = await Promise.all([
          listBlocks(site, from, to),
          getIcalFeedsStatus(site),
        ]);
      } else {
        // A booking code (typed any way) opens that booking; any other text is
        // searched on the site across every status.
        const code = q ? normalizeBookingCode(q) : null;
        const bookingView = view as BookingView;

        const [found, list] = await Promise.all([
          code ? getBookingByCode(site, code) : Promise.resolve(null),
          q
            ? searchBookings(site, q)
            : listBookingsByView(site, bookingView, LIST_LIMIT),
        ]);

        if (found) {
          jumpTo = `${base}/${found.id}?property=${property.id}`;
        } else {
          bookings = list;
        }
      }
    } catch (error) {
      if (!isVillaDbError(error)) throw error;
      siteError = error.message;
    }
  }

  // Outside the try: redirect() works by throwing.
  if (jumpTo) redirect(jumpTo);

  // Build filter hrefs for the blocked tab (pointing back to this page).
  const hrefFor = (next: {
    bview?: BlockedView;
    source?: BlockedSourceFilter;
    reason?: string;
  }) => {
    const q2 = new URLSearchParams({ view: 'blocked' });
    q2.set('bview', next.bview ?? bview);
    q2.set('source', next.source ?? source);
    const nextReason = next.reason ?? reason;
    if (nextReason !== 'all') q2.set('reason', nextReason);
    if (properties.length > 1 && property) q2.set('property', property.id);
    return `${base}?${q2.toString()}`;
  };

  const visible = blocks.filter((b) => {
    if (source === 'manual' && b.source !== 'manual') return false;
    if (source === 'channel' && b.source !== 'ical') return false;
    if (reason !== 'all' && b.reason !== reason) return false;
    return true;
  });

  const reasonsPresent = [
    ...new Set(blocks.map((b) => b.reason).filter((r): r is string => !!r)),
  ].sort();

  const blockedFilters = {
    view: BLOCKED_VIEWS.map((v) => ({
      value: v,
      href: hrefFor({ bview: v }),
      active: v === bview,
    })),
    source: BLOCKED_SOURCES.map((v) => ({
      value: v,
      href: hrefFor({ source: v }),
      active: v === source,
    })),
    reason: ['all', ...reasonsPresent].map((v) => ({
      value: v,
      href: hrefFor({ reason: v }),
      active: v === reason,
    })),
  };

  const canOverrideCutoff = role === 'villa_admin';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.bookings'} />}
        description={<AppBreadcrumbs />}
      />

      <div className="flex max-w-5xl flex-col gap-4">
        {!property ? (
          <Alert data-test={'villa-bookings-no-property'}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>No booking site connected</AlertTitle>
            <AlertDescription>
              Bookings appear here once Ooruda support connects your villa to
              its booking site.
            </AlertDescription>
          </Alert>
        ) : siteError ? (
          <Alert variant="destructive" data-test={'villa-bookings-site-error'}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Booking site unavailable</AlertTitle>
            <AlertDescription>{siteError}</AlertDescription>
          </Alert>
        ) : (
          <>
            <BookingsToolbar
              account={account}
              view={view}
              q={q}
              propertyId={property.id}
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
              action={
                isBlocked ? (
                  <SyncIcalButton
                    accountId={accountId}
                    propertyId={property.id}
                    lastSyncedAt={icalStatus.lastSyncedAt}
                    lastStatus={icalStatus.lastStatus}
                  />
                ) : (
                  <NewBookingDialog
                    accountId={accountId}
                    propertyId={property.id}
                    account={account}
                    bookingCutoffDate={bookingCutoffDate}
                    canOverrideCutoff={canOverrideCutoff}
                  />
                )
              }
            />

            {isBlocked ? (
              <BlockedDatesView
                accountId={accountId}
                propertyId={property.id}
                today={today}
                filters={blockedFilters}
                bookingCutoff={bookingCutoffDate}
                blocks={visible.map((b) => ({
                  id: b.id,
                  startDate: b.startDate,
                  endDate: b.endDate,
                  reason: b.reason,
                  notes: blockNoteForDisplay(b.notes),
                  source: b.source,
                }))}
              />
            ) : (
              <BookingsList
                account={account}
                propertyId={property.id}
                bookings={bookings}
                view={view as BookingView}
                searching={Boolean(q)}
                truncated={!q && bookings.length >= LIST_LIMIT}
              />
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}
