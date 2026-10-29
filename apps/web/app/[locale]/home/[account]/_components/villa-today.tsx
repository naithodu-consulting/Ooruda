import Link from 'next/link';

import { ArrowRight, CircleAlert, LogIn, LogOut, Moon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

import pathsConfig from '~/config/paths.config';
import {
  type SiteBooking,
  listBookings,
  listBookingsByView,
} from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { todayBoard } from '~/lib/villa/kpis';

/**
 * Today at the villa, read live from the booking site (an operational view,
 * never the mirror). Rendered in Suspense so a slow site can't hold up the
 * dashboard.
 */
export async function VillaToday(props: {
  account: string;
  accountId: string;
  propertyId: string;
}) {
  const today = todayIst();
  let bookings: SiteBooking[];
  let overdue: SiteBooking[] = [];

  try {
    const site = await getVillaSite(props.accountId, props.propertyId);
    [bookings, overdue] = await Promise.all([
      listBookings(site, addDays(today, -1), addDays(today, 1)),
      listBookingsByView(site, 'past', 50).then((rows) =>
        rows.filter((b) => b.status === 'confirmed' && b.checkOut < today),
      ),
    ]);
  } catch (error) {
    if (!isVillaDbError(error)) throw error;

    return (
      <Card className="bg-card lg:col-span-2" data-test={'villa-today-error'}>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <CircleAlert className="text-destructive h-4 w-4 shrink-0" />
          {error.message}
        </CardContent>
      </Card>
    );
  }

  const board = todayBoard(bookings, today);
  const href = (id: string) =>
    `${pathsConfig.app.accountVillaBookings.replace('[account]', props.account)}/${id}?property=${props.propertyId}`;

  const columns = [
    {
      key: 'arrivals',
      label: 'Arriving',
      Icon: LogIn,
      rows: board.arrivals,
      empty: 'No arrivals',
      accent: 'bg-success/10 text-success',
      countAccent: 'bg-success/15 text-success',
      dotColor: 'bg-success',
    },
    {
      key: 'departures',
      label: 'Checking out',
      Icon: LogOut,
      rows: board.departures,
      empty: 'No departures',
      accent: 'bg-warning/10 text-warning',
      countAccent: 'bg-warning/15 text-warning',
      dotColor: 'bg-warning',
    },
    {
      key: 'in-house',
      label: 'Staying tonight',
      Icon: Moon,
      rows: board.inHouse,
      empty: 'Villa is free',
      accent: 'bg-info/10 text-info',
      countAccent: 'bg-info/15 text-info',
      dotColor: 'bg-info',
    },
  ] as const;

  return (
    <Card className="bg-card lg:col-span-2" data-test={'villa-today'}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Today</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {columns.map(
            ({
              key,
              label,
              Icon,
              rows,
              empty,
              accent,
              countAccent,
              dotColor,
            }) => (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-xl border p-3 sm:p-4"
                data-test={`villa-today-${key}`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
                      accent,
                    )}
                  >
                    <Icon className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                  <span
                    className={cn(
                      'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      countAccent,
                    )}
                  >
                    {rows.length}
                  </span>
                </div>

                {/* Mobile label */}
                <p className="text-muted-foreground text-xs font-medium sm:hidden">
                  {label}
                </p>

                {/* Guest list / empty state */}
                <div className="flex min-h-8 flex-col justify-center">
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{empty}</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {rows.map((b) => (
                        <li
                          key={b.id}
                          className="flex min-w-0 items-center gap-1.5"
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              dotColor,
                            )}
                            aria-hidden
                          />
                          <Link
                            href={href(b.id)}
                            className="hover:text-brand-ink truncate text-sm font-medium underline-offset-2 hover:underline"
                            data-test={'villa-today-guest'}
                          >
                            {b.guestName}
                          </Link>
                          {key === 'arrivals' &&
                          (b.idStatus === 'pending' ||
                            b.paymentStatus !== 'paid') ? (
                            <span className="inline-flex shrink-0 items-center gap-1">
                              {b.idStatus === 'pending' ? (
                                <span
                                  className="bg-warning/15 text-warning rounded px-1.5 py-0.5 text-xs font-semibold"
                                  title="ID document pending"
                                >
                                  ID
                                </span>
                              ) : null}
                              {b.paymentStatus !== 'paid' ? (
                                <span
                                  className="bg-destructive/15 text-destructive rounded px-1.5 py-0.5 text-xs font-semibold"
                                  title="Payment due"
                                >
                                  Due
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        {overdue.length > 0 ? (
          <div
            className="border-warning/30 bg-warning/5 flex flex-col gap-3 rounded-xl border p-3.5"
            data-test={'villa-today-overdue'}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-warning/20 text-warning flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {overdue.length}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-foreground text-sm font-semibold">
                  {overdue.length === 1
                    ? 'Stay overdue for check-out'
                    : 'Stays overdue for check-out'}
                </p>
                <p className="text-muted-foreground text-xs">
                  Check them out on the booking page to complete the stay and
                  send the thank-you email.
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:pl-10">
              {overdue.map((b) => (
                <Link
                  key={b.id}
                  href={href(b.id)}
                  className="border-warning/40 bg-background text-warning hover:bg-warning/10 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors"
                  data-test={'villa-today-overdue-guest'}
                >
                  <span>{b.guestName}</span>
                  <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
                    <ArrowRight className="h-3 w-3" />
                    Check out
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
