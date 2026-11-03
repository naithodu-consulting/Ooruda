import Link from 'next/link';

import { ChevronRight, Rss, TriangleAlert, Users } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

import { daysBetweenYmd } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import type { BookingView, SiteBooking } from '~/lib/villa-db/bookings';
import { lastNightOf } from '~/lib/villa-db/dates';
import {
  bookingStatusLabel,
  channelLabel,
  formatNights,
  paymentStatusLabel,
} from '~/lib/villa/labels';
import { fromPaise } from '~/lib/villa/money';

import { AddChannelDetailsButton } from './add-channel-details-button';

const EMPTY: Record<BookingView, string> = {
  upcoming: 'No upcoming bookings.',
  in_house: 'No guests staying right now.',
  past: 'No past stays yet.',
  cancelled: 'No cancelled bookings.',
};

/**
 * A stay imported from a booking channel. It is a block on the booking site,
 * not a booking: there is no guest name, no money and no booking page, and
 * the channel owns it. It is listed here anyway because an operator looking
 * at Bookings is asking "is the villa sold on these nights", and leaving
 * channel stays out answered that question wrongly.
 */
export interface ChannelStay {
  id: string;
  channelName: string | null;
  startDate: string;
  /** Exclusive: the morning after the last night held. */
  endDate: string;
  /** Airbnb confirmation code, when the feed carried one. */
  confirmationCode: string | null;
  /** Last four digits of the guest's phone, when the feed carried them. */
  phoneLast4: string | null;
  /** The feed that owns this stay; half of the key a booking links by. */
  feedId: string | null;
  /**
   * The channel's UID for this event. Without it there is nothing stable to
   * link a booking to, so the stay cannot be filled in until a sync brings
   * one; in practice Airbnb always sends one.
   */
  externalUid: string | null;
}

export function BookingsList(props: {
  account: string;
  accountId: string;
  propertyId: string;
  bookings: SiteBooking[];
  /**
   * Imported channel stays for this view, with those already filled in left
   * out: a stay must appear once, as the booking, never as both.
   */
  channelStays?: ChannelStay[];
  /**
   * Channel-linked bookings the channel's calendar no longer lists. The stay
   * still holds its nights; the row says so and asks for a human.
   */
  orphanedBookingIds?: string[];
  view: BookingView;
  searching: boolean;
  /** The list hit its size limit; older rows are not shown. */
  truncated?: boolean;
}) {
  const channelStays = props.channelStays ?? [];
  const orphaned = new Set(props.orphanedBookingIds ?? []);

  if (props.bookings.length === 0 && channelStays.length === 0) {
    return (
      <Card className="bg-card">
        <CardContent
          className="text-muted-foreground py-10 text-center text-sm"
          data-test={'villa-bookings-empty'}
        >
          {props.searching
            ? 'No bookings match that search.'
            : EMPTY[props.view]}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Card className="bg-card overflow-hidden">
        <ul className="divide-border divide-y">
          {channelStays.map((stay) => (
            <ChannelStayRow
              key={`c-${stay.id}`}
              stay={stay}
              account={props.account}
              accountId={props.accountId}
              propertyId={props.propertyId}
            />
          ))}
          {props.bookings.map((b) => {
            const guests = b.adults + b.children;

            return (
              <li key={b.id}>
                <Link
                  href={`/home/${props.account}/bookings/${b.id}?property=${props.propertyId}`}
                  data-test={'villa-booking-row'}
                  data-booking-code={b.bookingCode ?? ''}
                  className="hover:bg-muted/50 focus-visible:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-col sm:w-56">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-sm font-medium">
                          {b.guestName}
                        </span>
                        {b.specialRequests ? (
                          <span
                            title={`Special request: ${b.specialRequests}`}
                            className="border-warning/30 bg-warning/5 text-warning shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium"
                          >
                            Request
                          </span>
                        ) : null}
                        {orphaned.has(b.id) ? (
                          <span
                            title="The channel's calendar no longer lists this stay. The nights are still held here."
                            className="border-warning/30 bg-warning/5 text-warning flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium"
                            data-test={'villa-booking-channel-dropped'}
                          >
                            <TriangleAlert className="h-3 w-3" aria-hidden />
                            Gone from channel
                          </span>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground font-mono text-xs">
                        {b.bookingCode ?? b.referenceNumber}
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-col sm:flex-1">
                      <span className="text-sm">
                        {formatDateReadable(b.checkIn)} –{' '}
                        {formatDateReadable(b.checkOut)}
                      </span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                        {formatNights(b.nights)}
                        <span aria-hidden>·</span>
                        <Users className="h-3 w-3" aria-hidden />
                        {guests}
                        {b.infants
                          ? ` + ${b.infants} infant${b.infants === 1 ? '' : 's'}`
                          : ''}
                        <span aria-hidden>·</span>
                        {channelLabel(b.channel)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge
                        variant="outline"
                        data-test={'villa-booking-status'}
                        className={cn(
                          b.status === 'cancelled' &&
                            'border-destructive/40 text-destructive',
                        )}
                      >
                        {bookingStatusLabel(b.status)}
                      </Badge>
                      <Badge
                        variant="outline"
                        data-test={'villa-booking-payment-badge'}
                        className={cn(
                          b.paymentStatus === 'paid' &&
                            'border-success/40 text-success',
                          b.paymentStatus === 'unpaid' &&
                            b.status === 'confirmed' &&
                            'border-warning/40 text-warning',
                        )}
                      >
                        {paymentStatusLabel(b.paymentStatus)}
                      </Badge>
                      <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                        {formatINR(fromPaise(b.totalAmountPaise))}
                      </span>
                    </div>
                  </div>

                  <ChevronRight
                    className="text-muted-foreground h-4 w-4 shrink-0"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      {props.truncated ? (
        <p
          className="text-muted-foreground text-xs"
          data-test={'villa-bookings-truncated'}
        >
          Showing the first {props.bookings.length}. Search by guest, phone or
          booking number to find others.
        </p>
      ) : null}
    </div>
  );
}

function ChannelStayRow(props: {
  stay: ChannelStay;
  account: string;
  accountId: string;
  propertyId: string;
}) {
  const { stay } = props;
  const lastNight = lastNightOf(stay.endDate);
  const nights = daysBetweenYmd(stay.startDate, stay.endDate);
  const name = stay.channelName ?? 'Channel';

  return (
    <li
      className="flex items-center gap-3 px-4 py-3"
      data-test={'villa-booking-channel-row'}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-col sm:w-56">
          <div className="flex items-center gap-1.5">
            <Rss
              className="text-muted-foreground h-3.5 w-3.5 shrink-0"
              aria-hidden
            />
            <span className="truncate text-sm font-medium">{name} booking</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col sm:flex-1">
          <span className="text-sm">
            {formatDateReadable(stay.startDate)} –{' '}
            {formatDateReadable(stay.endDate)}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatNights(nights)} · last night {formatDateReadable(lastNight)}
            {stay.phoneLast4 ? ` · phone ending ${stay.phoneLast4}` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="outline">Booked on {name}</Badge>
          {stay.feedId && stay.externalUid ? (
            <AddChannelDetailsButton
              account={props.account}
              accountId={props.accountId}
              propertyId={props.propertyId}
              stay={{
                feedId: stay.feedId,
                externalUid: stay.externalUid,
                channelName: stay.channelName,
                startDate: stay.startDate,
                endDate: stay.endDate,
                nights,
                confirmationCode: stay.confirmationCode,
                phoneLast4: stay.phoneLast4,
              }}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              Guest and money stay on {name}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
