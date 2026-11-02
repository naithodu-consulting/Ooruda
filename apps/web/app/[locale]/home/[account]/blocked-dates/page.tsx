import { CircleAlert } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { type Block, listBlocks } from '~/lib/villa-db/blocks';
import { listChannelLinkedBookings } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { blockNoteForDisplay } from '~/lib/villa/calendar';
import { linkChannelStays } from '~/lib/villa/channel-link';
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSwitcher } from '../_components/villa-switcher';
import { BlockedDatesView } from './_components/blocked-dates-view';

export const metadata = { title: 'Blocked dates' };

/**
 * Every block in one list, which the month calendar cannot give: a block three
 * months out is invisible until you page to its month, and a channel-imported
 * one looks the same as one of your own. Both matter when a night will not
 * sell and nobody remembers why.
 */

export const BLOCKED_VIEWS = ['upcoming', 'past', 'all'] as const;
export type BlockedView = (typeof BLOCKED_VIEWS)[number];

export const BLOCKED_SOURCES = ['all', 'manual', 'channel'] as const;
export type BlockedSourceFilter = (typeof BLOCKED_SOURCES)[number];

/** How far either way a list reaches. Blocks beyond this are not realistic. */
const PAST_DAYS = 365;
const FUTURE_DAYS = 730;

function windowFor(view: BlockedView, today: string) {
  switch (view) {
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
    property?: string;
    view?: string;
    source?: string;
    reason?: string;
  }>;
}

export default async function BlockedDatesPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const today = todayIst();

  const view: BlockedView = BLOCKED_VIEWS.includes(sp.view as BlockedView)
    ? (sp.view as BlockedView)
    : 'upcoming';

  const source: BlockedSourceFilter = BLOCKED_SOURCES.includes(
    sp.source as BlockedSourceFilter,
  )
    ? (sp.source as BlockedSourceFilter)
    : 'all';

  const reason = sp.reason && /^[a-z_]+$/.test(sp.reason) ? sp.reason : 'all';

  const { accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { properties, property } = await selectVillaProperty(
    accountId,
    sp.property,
    { requireSite: true },
  );

  const header = (
    <TeamAccountLayoutPageHeader
      account={account}
      title={<Trans i18nKey={'villa.nav.blockedDates'} />}
      description={<AppBreadcrumbs />}
    />
  );

  if (!property) {
    return (
      <PageBody>
        {header}
        <Alert data-test={'villa-blocked-no-property'}>
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>No booking site connected</AlertTitle>
          <AlertDescription>
            Blocked dates live on the villa&apos;s booking site. They appear
            here once Ooruda support connects it.
          </AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const { from, to } = windowFor(view, today);

  // The cutoff is not a block, but it is the other reason a night will not
  // sell, so the list says so rather than leaving the operator to wonder.
  const settingsPromise = getSupabaseServerClient()
    .from('villa_account_settings')
    .select('booking_cutoff_date')
    .eq('account_id', accountId)
    .maybeSingle();

  let blocks: Block[] = [];
  let siteError: string | null = null;
  // block id → the booking recorded for it, so a filled-in channel stay
  // offers its booking instead of the form.
  let recordedByBlock = new Map<string, string>();

  try {
    const site = await getVillaSite(accountId, property.id);
    const [blockList, linked] = await Promise.all([
      listBlocks(site, from, to),
      listChannelLinkedBookings(site, { from, to }),
    ]);

    blocks = blockList;

    const { blockIdByBooking } = linkChannelStays({
      blocks: blockList,
      bookings: linked,
      today,
    });

    recordedByBlock = new Map(
      [...blockIdByBooking].map(([bookingId, blockId]) => [blockId, bookingId]),
    );
  } catch (error) {
    if (!isVillaDbError(error)) throw error;
    siteError = error.message;
  }

  const { data: settings } = await settingsPromise;

  const base = pathsConfig.app.accountVillaBlockedDates.replace(
    '[account]',
    account,
  );

  // Filters are links, not state: the server does the filtering, so the list
  // survives a refresh and can be shared. Hrefs are built here because a
  // function cannot cross into a client component.
  const hrefFor = (next: {
    view?: BlockedView;
    source?: BlockedSourceFilter;
    reason?: string;
  }) => {
    const q = new URLSearchParams();
    q.set('view', next.view ?? view);
    q.set('source', next.source ?? source);
    const nextReason = next.reason ?? reason;
    if (nextReason !== 'all') q.set('reason', nextReason);
    if (properties.length > 1) q.set('property', property.id);
    return `${base}?${q.toString()}`;
  };

  // Narrowed after the fetch so the reason chips always list every reason in
  // the window, not only those left after the current filter.
  const visible = blocks.filter((b) => {
    if (source === 'manual' && b.source !== 'manual') return false;
    if (source === 'channel' && b.source !== 'ical') return false;
    if (reason !== 'all' && b.reason !== reason) return false;
    return true;
  });

  const reasonsPresent = [
    ...new Set(blocks.map((b) => b.reason).filter((r): r is string => !!r)),
  ].sort();

  const filters = {
    view: BLOCKED_VIEWS.map((v) => ({
      value: v,
      href: hrefFor({ view: v }),
      active: v === view,
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

  return (
    <PageBody>
      {header}

      <div className="flex max-w-6xl flex-col gap-4">
        {properties.length > 1 ? (
          <VillaSwitcher properties={properties} current={property.id} />
        ) : null}

        {siteError ? (
          <Alert variant="destructive" data-test={'villa-blocked-site-error'}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Booking site unavailable</AlertTitle>
            <AlertDescription>{siteError}</AlertDescription>
          </Alert>
        ) : (
          <BlockedDatesView
            accountId={accountId}
            account={account}
            propertyId={property.id}
            today={today}
            filters={filters}
            bookingCutoff={settings?.booking_cutoff_date ?? null}
            blocks={visible.map((b) => ({
              id: b.id,
              startDate: b.startDate,
              endDate: b.endDate,
              reason: b.reason,
              notes: blockNoteForDisplay(b.notes),
              source: b.source,
              channelName: b.channelName,
              recordedBookingId: recordedByBlock.get(b.id) ?? null,
              feedId: b.feedId,
              externalUid: b.externalUid,
            }))}
          />
        )}
      </div>
    </PageBody>
  );
}
