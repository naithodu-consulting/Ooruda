import Link from 'next/link';

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LogIn,
  LogOut,
} from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
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
  let checkedInIds = new Set<string>();
  let departed: { id: string; guestName: string }[] = [];

  try {
    const client = getSupabaseServerClient();
    const site = await getVillaSite(props.accountId, props.propertyId);
    const [bookingsData, overdueData, inHouseRows, departedRows] =
      await Promise.all([
        listBookings(site, addDays(today, -1), addDays(today, 1)),
        listBookingsByView(site, 'past', 50).then((rows) =>
          rows.filter((b) => b.status === 'confirmed' && b.checkOut < today),
        ),
        // Bounded to stays that have not ended: without the check_out floor
        // this grows into every stay ever checked in, to answer a question
        // only about today.
        client
          .from('villa_bookings_mirror')
          .select('site_booking_id')
          .eq('property_id', props.propertyId)
          .not('checked_in_at', 'is', null)
          .gte('check_out', addDays(today, -1)),
        // Checked out today, by when the check-out happened rather than by
        // the booking's dates: an early departure and a late one both belong
        // on today's board, and neither is found by `check_out`.
        client
          .from('villa_bookings_mirror')
          .select('site_booking_id, guest_name')
          .eq('property_id', props.propertyId)
          .gte('checked_out_at', `${today}T00:00:00+05:30`)
          .lt('checked_out_at', `${addDays(today, 1)}T00:00:00+05:30`),
      ]);
    bookings = bookingsData;
    overdue = overdueData;
    checkedInIds = new Set(
      (inHouseRows.data ?? []).map((r) => r.site_booking_id),
    );
    departed = (departedRows.data ?? []).map((r) => ({
      id: r.site_booking_id,
      guestName: r.guest_name,
    }));
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

  const board = todayBoard(bookings, today, checkedInIds);
  const href = (id: string) =>
    `${pathsConfig.app.accountVillaBookings.replace('[account]', props.account)}/${id}?property=${props.propertyId}`;

  // One shape for every tile, so a row renders the same whether it came from
  // the booking site or from the mirror's check-out stamp.
  interface TodayRow {
    id: string;
    guestName: string;
    /** The day's work on this guest is finished: shown as a tick, not a dot. */
    done?: boolean;
    idPending?: boolean;
    paymentDue?: boolean;
  }

  const arrivalRows: TodayRow[] = board.arrivals.map((b) => ({
    id: b.id,
    guestName: b.guestName,
    idPending: b.idStatus === 'pending',
    paymentDue: b.paymentStatus !== 'paid',
  }));

  const checkedInRows: TodayRow[] = board.checkedIn.map((b) => ({
    id: b.id,
    guestName: b.guestName,
  }));

  // Today's departures are the stays still to leave plus the ones already
  // checked out, in that order: what is left to do first, then the record
  // that the rest is done. A stay checked out today is `completed`, so it
  // has already dropped out of `board.departures` - the two cannot overlap.
  const departureRows: TodayRow[] = [
    ...board.departures.map((b) => ({ id: b.id, guestName: b.guestName })),
    ...departed.map((d) => ({ id: d.id, guestName: d.guestName, done: true })),
  ];

  const departuresLeft = departureRows.filter((r) => !r.done).length;

  const columns = [
    {
      key: 'arrivals',
      label: 'Arriving',
      Icon: LogIn,
      rows: arrivalRows,
      empty: 'No arrivals',
      accent: 'bg-info/10 text-info',
      countAccent: 'bg-info/15 text-info',
      dotColor: 'bg-info',
    },
    {
      key: 'checked-in',
      label: 'Checked in',
      Icon: CheckCircle2,
      rows: checkedInRows,
      empty: 'None checked in',
      accent: 'bg-success/10 text-success',
      countAccent: 'bg-success/15 text-success',
      dotColor: 'bg-success',
    },
    {
      key: 'departures',
      label: 'Checking out',
      Icon: LogOut,
      rows: departureRows,
      empty: 'No departures',
      accent: 'bg-warning/10 text-warning',
      countAccent: 'bg-warning/15 text-warning',
      dotColor: 'bg-warning',
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
                          data-test={
                            b.done
                              ? 'villa-today-row-done'
                              : 'villa-today-row-pending'
                          }
                        >
                          {b.done ? (
                            <CheckCircle2
                              className="text-success h-3.5 w-3.5 shrink-0"
                              aria-label="Checked out"
                            />
                          ) : (
                            <span
                              className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                dotColor,
                              )}
                              aria-hidden
                            />
                          )}
                          <Link
                            href={href(b.id)}
                            className={cn(
                              'hover:text-brand-ink truncate text-sm font-medium underline-offset-2 hover:underline',
                              b.done && 'text-muted-foreground',
                            )}
                            data-test={'villa-today-guest'}
                          >
                            {b.guestName}
                          </Link>
                          {b.idPending || b.paymentDue ? (
                            <span className="inline-flex shrink-0 items-center gap-1">
                              {b.idPending ? (
                                <span
                                  className="bg-warning/15 text-warning rounded px-1.5 py-0.5 text-xs font-semibold"
                                  title="ID document pending"
                                >
                                  ID
                                </span>
                              ) : null}
                              {b.paymentDue ? (
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

                {/* Departures are the one tile that holds finished work too,
                    so it says how much of the day is left to do. */}
                {key === 'departures' && rows.length > 0 ? (
                  <p
                    className="text-muted-foreground text-xs"
                    data-test={'villa-today-departures-progress'}
                  >
                    {departuresLeft === 0
                      ? 'All checked out'
                      : `${departuresLeft} still to check out`}
                  </p>
                ) : null}
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
