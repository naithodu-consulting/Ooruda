'use client';

import { useState } from 'react';

import Link from 'next/link';

import { Ban, Lock, Rss } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

import { daysBetweenYmd } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { lastNightOf } from '~/lib/villa-db/dates';
import { parseChannelNote } from '~/lib/villa/channel-note';
import { blockLabel, blockReasonLabel, formatNights } from '~/lib/villa/labels';

import { AddChannelDetailsButton } from '../../bookings/_components/add-channel-details-button';
import {
  type ReleasableBlock,
  ReleaseBlockDialog,
} from '../../calendar/_components/release-block-dialog';

/**
 * A block as this list shows it: a channel block may already have a booking
 * recorded against it, in which case the list offers that booking instead of
 * the form.
 */
export interface BlockedListItem extends ReleasableBlock {
  recordedBookingId?: string | null;
  /** The feed and the channel's UID: the key a booking links by. */
  feedId?: string | null;
  externalUid?: string | null;
}

interface FilterOption {
  value: string;
  href: string;
  active: boolean;
}

const LABELS: Record<string, string> = {
  upcoming: 'Upcoming',
  past: 'Past',
  all: 'All',
  manual: 'Entered here',
  channel: 'From a channel',
};

function filterLabel(group: 'view' | 'source' | 'reason', value: string) {
  if (group === 'reason') {
    return value === 'all' ? 'Any reason' : blockReasonLabel(value);
  }

  return LABELS[value] ?? value;
}

/**
 * The blocked-date list: every block in the window with its reason, its nights
 * and where it came from. Only blocks entered here can be unblocked — a
 * channel's feed owns its own, and the next sync would put them straight back.
 */
export function BlockedDatesView(props: {
  accountId: string;
  /** Account slug, for the link to a recorded booking. */
  account: string;
  propertyId: string;
  today: string;
  bookingCutoff: string | null;
  filters: {
    view: FilterOption[];
    source: FilterOption[];
    reason: FilterOption[];
  };
  blocks: BlockedListItem[];
}) {
  const [releasing, setReleasing] = useState<ReleasableBlock | null>(null);

  return (
    <>
      <div className="flex flex-col gap-3">
        {(['view', 'source', 'reason'] as const).map((group) =>
          props.filters[group].length > 1 ? (
            <nav
              key={group}
              aria-label={group === 'view' ? 'Period' : group}
              className="flex flex-wrap gap-2"
              data-test={`villa-blocked-filter-${group}`}
            >
              {props.filters[group].map((option) => (
                <Link
                  key={option.value}
                  href={option.href}
                  prefetch={true}
                  aria-current={option.active ? 'page' : undefined}
                  scroll={false}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    option.active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-muted',
                  )}
                  data-test={`villa-blocked-filter-${group}-${option.value}`}
                >
                  {filterLabel(group, option.value)}
                </Link>
              ))}
            </nav>
          ) : null,
        )}
      </div>

      {props.bookingCutoff ? (
        <Alert data-test={'villa-blocked-cutoff'}>
          <Lock className="h-4 w-4" />
          <AlertTitle>
            Also closed: every night after{' '}
            {formatDateReadable(props.bookingCutoff)}
          </AlertTitle>
          <AlertDescription>
            That is the booking cutoff, not a block, so it is not listed here.
            Those nights cannot be sold and do not need blocking. Change the
            date in Settings.
          </AlertDescription>
        </Alert>
      ) : null}

      {props.blocks.length === 0 ? (
        <Card className="bg-card">
          <CardContent
            className="text-muted-foreground py-10 text-center text-sm"
            data-test={'villa-blocked-empty'}
          >
            No blocked dates match these filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card overflow-hidden">
          <ul
            className="divide-border divide-y"
            data-test={'villa-blocked-list'}
          >
            {props.blocks.map((block) => (
              <BlockRow
                key={block.id}
                block={block}
                today={props.today}
                account={props.account}
                accountId={props.accountId}
                propertyId={props.propertyId}
                onRelease={() => setReleasing(block)}
              />
            ))}
          </ul>
        </Card>
      )}

      {releasing ? (
        <ReleaseBlockDialog
          accountId={props.accountId}
          propertyId={props.propertyId}
          block={releasing}
          onClose={() => setReleasing(null)}
        />
      ) : null}
    </>
  );
}

function BlockRow(props: {
  block: BlockedListItem;
  today: string;
  account: string;
  accountId: string;
  propertyId: string;
  onRelease: () => void;
}) {
  const { block } = props;
  const lastNight = lastNightOf(block.endDate);
  const nights = daysBetweenYmd(block.startDate, block.endDate);
  const channelOwned = block.source === 'ical';
  const allPast = lastNight < props.today;
  const note = parseChannelNote(block.notes);
  // A host's own hold on the channel sold nothing, so there is no guest and
  // no money to record against it.
  const sold = channelOwned && !note.isChannelBlock;
  const canRecord = sold && Boolean(block.feedId) && Boolean(block.externalUid);

  return (
    <li
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
      data-test={'villa-blocked-row'}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{blockLabel(block)}</span>
          {channelOwned ? (
            <Badge variant="outline" className="gap-1">
              <Rss className="h-3 w-3" aria-hidden />
              {block.channelName ?? 'From a channel'}
            </Badge>
          ) : null}
          {allPast ? <Badge variant="secondary">Past</Badge> : null}
        </div>

        <span className="text-muted-foreground text-xs">
          {block.startDate === lastNight
            ? `Night of ${formatDateReadable(block.startDate)}`
            : `${formatDateReadable(block.startDate)} – ${formatDateReadable(lastNight)}`}{' '}
          · {formatNights(nights)} · free again from the morning of{' '}
          {formatDateReadable(block.endDate)}
        </span>

        {block.notes ? (
          <span className="text-muted-foreground text-xs">{block.notes}</span>
        ) : null}
      </div>

      {sold && block.recordedBookingId ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          render={
            <Link
              href={`/home/${props.account}/bookings/${block.recordedBookingId}?property=${props.propertyId}`}
              data-test={'villa-blocked-open-booking'}
            />
          }
        >
          Open booking
        </Button>
      ) : canRecord ? (
        <AddChannelDetailsButton
          accountId={props.accountId}
          propertyId={props.propertyId}
          className="shrink-0"
          stay={{
            feedId: block.feedId!,
            externalUid: block.externalUid!,
            channelName: block.channelName ?? null,
            startDate: block.startDate,
            endDate: block.endDate,
            nights,
            confirmationCode: note.confirmationCode,
            phoneLast4: note.phoneLast4,
          }}
        />
      ) : channelOwned ? (
        <span
          className="text-muted-foreground shrink-0 text-xs sm:max-w-56 sm:text-right"
          data-test={'villa-blocked-channel-note'}
        >
          Remove it on the channel; the next sync clears it here.
        </span>
      ) : allPast ? (
        <span className="text-muted-foreground shrink-0 text-xs">
          Nights already gone
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={props.onRelease}
          data-test={'villa-blocked-unblock'}
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Unblock
        </Button>
      )}
    </li>
  );
}
