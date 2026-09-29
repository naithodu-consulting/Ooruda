import Link from 'next/link';

import { CircleAlert, LogIn, LogOut, Moon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

import pathsConfig from '~/config/paths.config';
import { type SiteBooking, listBookings } from '~/lib/villa-db/bookings';
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

  try {
    const site = await getVillaSite(props.accountId, props.propertyId);
    // Yesterday..tomorrow covers today's departures as well as tonight.
    bookings = await listBookings(site, addDays(today, -1), addDays(today, 1));
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
      title: 'Arriving today',
      Icon: LogIn,
      rows: board.arrivals,
      empty: 'No arrivals',
    },
    {
      key: 'departures',
      title: 'To check out today',
      Icon: LogOut,
      rows: board.departures,
      empty: 'No departures',
    },
    {
      key: 'in-house',
      title: 'Staying tonight',
      Icon: Moon,
      rows: board.inHouse,
      empty: 'The villa is free tonight',
    },
  ] as const;

  return (
    <Card className="bg-card lg:col-span-2" data-test={'villa-today'}>
      <CardHeader>
        <CardTitle className="text-base">Today</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {columns.map(({ key, title, Icon, rows, empty }) => (
          <section key={key} data-test={`villa-today-${key}`}>
            <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {title}
              <span className="text-foreground ml-auto tabular-nums">
                {rows.length}
              </span>
            </h3>
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">{empty}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={href(b.id)}
                      className="hover:text-primary block truncate text-sm font-medium underline-offset-2 hover:underline"
                      data-test={'villa-today-guest'}
                    >
                      {b.guestName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
