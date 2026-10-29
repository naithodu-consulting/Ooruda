import { after } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Card, CardContent } from '@kit/ui/card';

import { formatINR } from '~/lib/format-inr';
import { todayIst } from '~/lib/villa-db/dates';
import { monthRange } from '~/lib/villa/calendar';
import { runDueGuestEmails } from '~/lib/villa/guest-email-runner';
import { purgeExpiredGuestIds } from '~/lib/villa/guest-id-retention';
import { SELLING_STATUSES, monthKpis } from '~/lib/villa/kpis';
import { refreshMirrorForRead } from '~/lib/villa/mirror';

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/**
 * This month's numbers from the bookings mirror. A stale mirror is refreshed
 * before the figures are read, so they are current on this load; the wait is
 * bounded and the first copy of a villa is made in the background, so the
 * page is never held open by the booking site. A site that failed recently is
 * not retried on every load.
 */
export async function VillaMonthKpis(props: {
  accountId: string;
  propertyId: string;
}) {
  const now = Date.now();
  const month = todayIst().slice(0, 7);
  const { from, to } = monthRange(month);

  // Guest ID retention and due guest emails also run on dashboard visits,
  // so neither depends on the scheduler alone. Cheap when nothing is due.
  after(async () => {
    try {
      await runDueGuestEmails(props.accountId);
    } catch (error) {
      (await getLogger()).error(
        { accountId: props.accountId, error: String(error) },
        'villa dashboard guest emails failed',
      );
    }

    try {
      await purgeExpiredGuestIds(props.accountId);
    } catch (error) {
      (await getLogger()).error(
        { accountId: props.accountId, error: String(error) },
        'villa dashboard id purge failed',
      );
    }
  });

  // Refresh before reading, so this month's figures are current on this load
  // rather than the next one. Takes a lease, so concurrent loads never run two
  // syncs; see refreshMirrorForRead for how the wait is bounded.
  const { syncedAt, failing } = await refreshMirrorForRead(
    props.accountId,
    props.propertyId,
  );

  const { data: stays, error } = await getSupabaseServerClient()
    .from('villa_bookings_mirror')
    .select(
      'status, check_in, check_out, nights, base_amount, extra_guest_amount, discount_amount',
    )
    .eq('property_id', props.propertyId)
    .in('status', [...SELLING_STATUSES])
    .lt('check_in', to)
    .gt('check_out', from);

  if (error) throw new Error(`mirror load failed: ${error.message}`);

  const k = monthKpis(month, stays ?? []);
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(
    'en-IN',
    { month: 'long', timeZone: 'UTC' },
  );

  const tiles = [
    {
      key: 'occupancy',
      label: `${monthName} Occupancy`,
      value: `${k.occupancyPct}%`,
      hint: `${k.bookedNights} of ${k.nightsInMonth} nights booked`,
    },
    {
      key: 'revenue',
      label: `${monthName} Revenue`,
      value: formatINR(k.revenue),
      hint: `Before GST, ${k.stays} stay${k.stays === 1 ? '' : 's'}`,
    },
    {
      key: 'adr',
      label: 'Avg. Booked Night',
      value: formatINR(k.averageNightly),
      hint: 'Revenue per booked night',
    },
    {
      key: 'revpar',
      label: 'Avg. Available Night',
      value: formatINR(k.revenuePerNight),
      hint: 'Across every night of the month',
    },
  ];

  return (
    <section
      className="flex flex-col gap-2 lg:col-span-2"
      data-test={'villa-kpis'}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card
            key={t.key}
            className="bg-card"
            data-test={`villa-kpi-${t.key}`}
          >
            <CardContent className="flex flex-col gap-1 px-4 py-3 sm:px-5 sm:py-4">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t.label}
              </span>
              <span className="text-xl font-bold tabular-nums sm:text-2xl">
                {t.value}
              </span>
              <span className="text-muted-foreground text-xs">{t.hint}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <p
        className="text-muted-foreground text-xs"
        data-test={'villa-kpis-synced'}
      >
        {syncedAt
          ? `Figures updated ${ago(syncedAt, now)}.`
          : failing
            ? 'Figures could not be loaded from the booking site yet.'
            : 'Loading figures from the booking site. Refresh in a moment.'}
        {failing && syncedAt
          ? ' The latest refresh from the booking site failed; showing the last good figures.'
          : ''}
      </p>
    </section>
  );
}
