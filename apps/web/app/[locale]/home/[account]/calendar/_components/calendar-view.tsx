'use client';

import { useState } from 'react';

import Link from 'next/link';

import { Ban, ChevronRight, Lock, Rss } from 'lucide-react';

import { Card, CardContent } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

import { formatDateReadable } from '~/lib/format-date';
import type { AgendaEntry, CalendarDay, NightItem } from '~/lib/villa/calendar';
import { blockReasonLabel } from '~/lib/villa/labels';

import {
  type ReleasableBlock,
  ReleaseBlockDialog,
} from './release-block-dialog';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TONE = {
  booked: 'bg-primary/30 text-foreground border-primary/60',
  held: 'bg-warning/15 text-foreground border-warning border-dashed',
  blocked: 'bg-muted-foreground/15 text-foreground border-muted-foreground/40',
  closed: 'bg-destructive/10 text-foreground border-destructive/30',
} as const;

/**
 * Month grid from 768px up, a date-ordered agenda below it. Bookings open
 * their booking page; blocks open the unblock dialog.
 *
 * Nights past the booking cutoff are drawn as closed and offer no actions:
 * they are already unsellable on the guest site, so blocking or unblocking
 * them changes nothing there. Channel-imported blocks are shown but not
 * clickable — the channel owns them.
 */
export function CalendarView(props: {
  accountId: string;
  propertyId: string;
  bookingHref: string;
  weeks: CalendarDay[][];
  agenda: AgendaEntry[];
  blocks: ReleasableBlock[];
  bookingCutoff: string | null;
}) {
  const [mobileView, setMobileView] = useState<'grid' | 'agenda'>('grid');
  const [releasing, setReleasing] = useState<ReleasableBlock | null>(null);
  const openBlock = (id: string) => {
    const block = props.blocks.find((b) => b.id === id);

    // Channel-owned: the next feed sync would put it straight back.
    if (!block || block.source === 'ical') return;

    setReleasing(block);
  };
  const hrefFor = (id: string) => props.bookingHref.replace('[id]', id);
  const blockSource = (id: string) =>
    props.blocks.find((b) => b.id === id)?.source ?? 'manual';

  return (
    <>
      <div className="flex items-center justify-between md:hidden">
        <div className="bg-muted inline-flex rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMobileView('grid')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mobileView === 'grid'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setMobileView('agenda')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mobileView === 'agenda'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Agenda
          </button>
        </div>
      </div>

      <Card
        className={cn(
          'bg-card overflow-hidden',
          mobileView === 'agenda' && 'hidden md:block',
        )}
      >
        <div
          className="bg-muted/30 grid grid-cols-7 border-b"
          role="row"
          aria-hidden
        >
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-muted-foreground px-1 py-1.5 text-center text-[10px] font-semibold tracking-wide uppercase md:px-2.5 md:py-2 md:text-left md:text-xs"
            >
              {d}
            </div>
          ))}
        </div>

        <div
          role="grid"
          aria-label="Villa calendar"
          data-test={'villa-calendar-grid'}
        >
          {props.weeks.map((week) => (
            <div
              key={week[0]!.date}
              role="row"
              className="grid grid-cols-7 border-b last:border-b-0"
            >
              {week.map((day, col) => (
                <DayCell
                  key={day.date}
                  day={day}
                  col={col}
                  hrefFor={hrefFor}
                  onBlock={openBlock}
                  blockSource={blockSource}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="bg-muted/20 border-t px-4 py-2.5">
          <Legend showClosed={!!props.bookingCutoff} />
        </div>
      </Card>

      <div
        className={cn(
          'flex flex-col gap-3',
          mobileView === 'grid' ? 'hidden md:hidden' : 'md:hidden',
        )}
      >
        <Legend showClosed={!!props.bookingCutoff} />
        <Agenda
          entries={props.agenda}
          hrefFor={hrefFor}
          onBlock={openBlock}
          blockSource={blockSource}
        />
      </div>

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

function Legend(props: { showClosed: boolean }) {
  return (
    <ul
      className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
      aria-label="Legend"
    >
      <li className="flex items-center gap-1.5">
        <span className={cn('h-3 w-3 rounded-sm border', TONE.booked)} />
        Booked
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cn('h-3 w-3 rounded-sm border', TONE.held)} />
        Awaiting payment (held)
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cn('h-3 w-3 rounded-sm border', TONE.blocked)} />
        Blocked
      </li>
      {props.showClosed ? (
        <li className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm border', TONE.closed)} />
          Closed for booking (past cutoff)
        </li>
      ) : null}
    </ul>
  );
}

function DayCell(props: {
  day: CalendarDay;
  col: number;
  hrefFor: (id: string) => string;
  onBlock: (id: string) => void;
  blockSource: (id: string) => 'manual' | 'ical';
}) {
  const { day } = props;

  return (
    <div
      role="gridcell"
      aria-label={
        day.pastCutoff
          ? `${formatDateReadable(day.date)}: closed for booking`
          : formatDateReadable(day.date)
      }
      data-test={`villa-calendar-day-${day.date}`}
      data-past-cutoff={day.pastCutoff ? 'true' : undefined}
      className={cn(
        'flex min-h-16 flex-col gap-0.5 border-r p-0.5 last:border-r-0 md:min-h-24 md:gap-1 md:p-1',
        !day.inMonth && 'bg-muted/30',
        day.pastCutoff && 'bg-destructive/5',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center self-end rounded-full text-[10px] tabular-nums md:h-6 md:w-6 md:text-xs',
          day.isToday && 'bg-primary text-primary-foreground font-semibold',
          !day.isToday &&
            (day.inMonth ? 'text-foreground' : 'text-muted-foreground'),
          day.isPast && !day.isToday && 'opacity-60',
        )}
      >
        {day.day}
      </span>

      {day.items.map((item) => (
        <NightChip
          key={`${item.kind}-${item.id}`}
          item={item}
          // The name shows where a stay starts and again at each week start.
          showLabel={item.starts || props.col === 0 || day.day === 1}
          hrefFor={props.hrefFor}
          onBlock={props.onBlock}
          blockSource={props.blockSource}
          dim={day.isPast}
        />
      ))}

      {day.pastCutoff && day.items.length === 0 ? (
        <span
          className={cn(
            'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
            TONE.closed,
          )}
          data-test={'villa-calendar-closed'}
        >
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">Closed</span>
        </span>
      ) : null}
    </div>
  );
}

function NightChip(props: {
  item: NightItem;
  showLabel: boolean;
  dim: boolean;
  hrefFor: (id: string) => string;
  onBlock: (id: string) => void;
  blockSource: (id: string) => 'manual' | 'ical';
}) {
  const { item } = props;
  const shape = cn(
    item.starts && !item.ends && 'rounded-l-md rounded-r-none border-r-0',
    !item.starts && item.ends && 'rounded-l-none rounded-r-md border-l-0',
    !item.starts && !item.ends && 'rounded-none border-x-0',
    item.starts && item.ends && 'rounded-md',
  );
  const className = cn(
    'block truncate border px-1.5 py-0.5 text-left text-xs transition-colors',
    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
    shape,
    props.dim && 'opacity-60',
  );

  if (item.kind === 'booking') {
    const tone = item.held ? TONE.held : TONE.booked;

    return (
      <Link
        href={props.hrefFor(item.id)}
        className={cn(className, tone, 'hover:bg-primary/25')}
        title={item.label}
        data-test={'villa-calendar-booking'}
      >
        {props.showLabel ? (
          item.label
        ) : (
          <span className="sr-only">{item.label}</span>
        )}
        {props.showLabel ? null : <span aria-hidden>&nbsp;</span>}
      </Link>
    );
  }

  const label = blockReasonLabel(item.reason);
  const channelOwned = props.blockSource(item.id) === 'ical';

  // A channel's own calendar owns these nights: the importer replaces its rows
  // on every sync, so unblocking here would be undone minutes later.
  if (channelOwned) {
    const title = `${label}: from a booking channel's calendar. Remove it on the channel.`;

    return (
      <span
        className={cn(className, TONE.blocked, 'flex items-center gap-1')}
        title={title}
        data-test={'villa-calendar-block-channel'}
      >
        <Rss className="h-3 w-3 shrink-0" aria-hidden />
        {props.showLabel ? (
          <span className="truncate">{label}</span>
        ) : (
          <span className="sr-only">{title}</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => props.onBlock(item.id)}
      className={cn(
        className,
        TONE.blocked,
        'hover:bg-muted/70 flex items-center gap-1',
      )}
      title={label}
      data-test={'villa-calendar-block'}
    >
      <Ban className="h-3 w-3 shrink-0" aria-hidden />
      {props.showLabel ? (
        <span className="truncate">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </button>
  );
}

function Agenda(props: {
  entries: AgendaEntry[];
  hrefFor: (id: string) => string;
  onBlock: (id: string) => void;
  blockSource: (id: string) => 'manual' | 'ical';
}) {
  if (props.entries.length === 0) {
    return (
      <Card className="bg-card">
        <CardContent
          className="text-muted-foreground py-10 text-center text-sm"
          data-test={'villa-calendar-empty'}
        >
          No bookings or blocked nights this month. Every night is open.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card overflow-hidden">
      <ul
        className="divide-border divide-y"
        data-test={'villa-calendar-agenda'}
      >
        {props.entries.map((e) => {
          const range =
            e.from === e.lastNight
              ? formatDateReadable(e.from)
              : `${formatDateReadable(e.from)} – ${formatDateReadable(e.lastNight)}`;
          const rowClass =
            'hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors';

          if (e.kind === 'booking') {
            return (
              <li key={`b-${e.id}`}>
                <Link
                  href={props.hrefFor(e.id)}
                  className={rowClass}
                  data-test={'villa-calendar-agenda-booking'}
                >
                  <span
                    className={cn(
                      'h-8 w-1.5 shrink-0 rounded-full border',
                      e.held ? TONE.held : TONE.booked,
                    )}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {e.guestName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {`In ${formatDateReadable(e.checkIn)} · Out ${formatDateReadable(e.checkOut)}`}
                      {e.held ? ' · awaiting payment' : ''}
                    </span>
                  </span>
                  <ChevronRight
                    className="text-muted-foreground h-4 w-4 shrink-0"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          }

          const channelOwned = props.blockSource(e.id) === 'ical';
          const nightsLabel =
            e.from === e.lastNight ? `Night of ${range}` : `Nights ${range}`;

          // Channel-owned blocks are shown, never actionable.
          if (channelOwned) {
            return (
              <li
                key={`k-${e.id}`}
                className="flex items-center gap-3 px-4 py-3"
                data-test={'villa-calendar-agenda-block-channel'}
              >
                <span
                  className={cn(
                    'h-8 w-1.5 shrink-0 rounded-full border',
                    TONE.blocked,
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {blockReasonLabel(e.reason)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {nightsLabel} · from a booking channel
                  </span>
                </span>
                <Rss
                  className="text-muted-foreground h-4 w-4 shrink-0"
                  aria-hidden
                />
              </li>
            );
          }

          return (
            <li key={`k-${e.id}`}>
              <button
                type="button"
                onClick={() => props.onBlock(e.id)}
                className={rowClass}
                data-test={'villa-calendar-agenda-block'}
              >
                <span
                  className={cn(
                    'h-8 w-1.5 shrink-0 rounded-full border',
                    TONE.blocked,
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {blockReasonLabel(e.reason)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {nightsLabel}
                  </span>
                </span>
                <ChevronRight
                  className="text-muted-foreground h-4 w-4 shrink-0"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
