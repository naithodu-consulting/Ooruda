import Link from 'next/link';

import { ChevronRight, Users } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import type { BookingView, SiteBooking } from '~/lib/villa-db/bookings';
import {
  bookingStatusLabel,
  channelLabel,
  formatNights,
  paymentStatusLabel,
} from '~/lib/villa/labels';
import { fromPaise } from '~/lib/villa/money';

const EMPTY: Record<BookingView, string> = {
  upcoming: 'No upcoming bookings.',
  in_house: 'No guests staying right now.',
  past: 'No past stays yet.',
  cancelled: 'No cancelled bookings.',
};

export function BookingsList(props: {
  account: string;
  propertyId: string;
  bookings: SiteBooking[];
  view: BookingView;
  searching: boolean;
  /** The list hit its size limit; older rows are not shown. */
  truncated?: boolean;
}) {
  if (props.bookings.length === 0) {
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
                      <span className="truncate text-sm font-medium">
                        {b.guestName}
                      </span>
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
