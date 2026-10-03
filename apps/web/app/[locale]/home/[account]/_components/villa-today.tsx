import Link from 'next/link';

import { CircleAlert, LogIn, LogOut, Moon } from 'lucide-react';

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
      accent:
        'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
      countAccent:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
      dotColor: 'bg-emerald-500',
    },
    {
      key: 'departures',
      label: 'Checking out',
      Icon: LogOut,
      rows: board.departures,
      empty: 'No departures',
      accent:
        'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
      countAccent:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
      dotColor: 'bg-amber-500',
    },
    {
      key: 'in-house',
      label: 'Staying tonight',
      Icon: Moon,
      rows: board.inHouse,
      empty: 'Villa is free',
      accent: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
      countAccent:
        'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
      dotColor: 'bg-blue-500',
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

                {/* Guest list */}
                {rows.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{empty}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {rows.map((b) => (
                      <li
                        key={b.id}
                        className="flex min-w-0 items-center gap-2"
                      >
                        <span
                          className={cn(
                            'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            dotColor,
                          )}
                          aria-hidden
                        />
                        <Link
                          href={href(b.id)}
                          className="hover:text-primary truncate text-sm font-medium underline-offset-2 hover:underline"
                          data-test={'villa-today-guest'}
                        >
                          {b.guestName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          )}
        </div>

        {overdue.length > 0 ? (
          <div
            className="border-warning/40 bg-warning/5 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:gap-4"
            data-test={'villa-today-overdue'}
          >
            <div className="flex shrink-0 items-center gap-2">
              <span className="bg-warning/20 text-warning flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold">
                {overdue.length}
              </span>
              <p className="text-sm font-medium">Not checked out yet</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs">
                Check-out date has passed — check them out so the thank-you
                email sends.
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                {overdue.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={href(b.id)}
                      className="text-warning text-sm font-medium underline-offset-2 hover:underline"
                      data-test={'villa-today-overdue-guest'}
                    >
                      {b.guestName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
