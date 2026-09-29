import { after } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Card, CardContent } from '@kit/ui/card';

import { formatINR } from '~/lib/format-inr';
import { todayIst } from '~/lib/villa-db/dates';
import { monthRange } from '~/lib/villa/calendar';
import { SELLING_STATUSES, monthKpis } from '~/lib/villa/kpis';
import { MIRROR_STALE_MS, syncPropertyMirror } from '~/lib/villa/mirror';

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

async function loadState(propertyId: string) {
  const { data, error } = await getSupabaseServerClient()
    .from('villa_mirror_sync_state')
    .select('last_synced_at, last_error_at')
    .eq('property_id', propertyId)
    .maybeSingle();

  if (error) throw new Error(`mirror state load failed: ${error.message}`);

  return data;
}

/**
 * This month's numbers from the bookings mirror. The page never waits on the
 * booking site: a missing or stale mirror is refreshed after the response,
 * and a site that failed recently is not retried on every load.
 */
export async function VillaMonthKpis(props: {
  accountId: string;
  propertyId: string;
}) {
  const now = Date.now();
  const month = todayIst().slice(0, 7);
  const { from, to } = monthRange(month);

  const state = await loadState(props.propertyId);
  const lastSync = state?.last_synced_at ? Date.parse(state.last_synced_at) : 0;
  const lastError = state?.last_error_at ? Date.parse(state.last_error_at) : 0;
  const failing = lastError > lastSync;
  const stale = now - lastSync > MIRROR_STALE_MS;
  const backingOff = failing && now - lastError < MIRROR_STALE_MS;

  if (stale && !backingOff) {
    const { accountId, propertyId } = props;
    after(async () => {
      try {
        // Takes a lease: concurrent loads never run two syncs.
        await syncPropertyMirror(accountId, propertyId);
      } catch (error) {
        (await getLogger()).warn(
          { propertyId, error: String(error) },
          'villa dashboard background sync failed',
        );
      }
    });
  }

  const { data: stays, error } = await getSupabaseServerClient()
    .from('villa_bookings_mirror')
    .select(
      'status, check_in, check_out, nights, base_amount, extra_guest_amount',
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
      label: `Occupancy, ${monthName}`,
      value: `${k.occupancyPct}%`,
      hint: `${k.bookedNights} of ${k.nightsInMonth} nights booked`,
    },
    {
      key: 'revenue',
      label: `Revenue, ${monthName}`,
      value: formatINR(k.revenue),
      hint: `Before GST, ${k.stays} stay${k.stays === 1 ? '' : 's'}`,
    },
    {
      key: 'adr',
      label: 'Average per night',
      value: formatINR(k.averageNightly),
      hint: 'Revenue per booked night',
    },
    {
      key: 'revpar',
      label: 'Revenue per available night',
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
            <CardContent className="flex flex-col gap-1 px-4 py-3 sm:px-6 sm:py-4">
              <span className="text-muted-foreground text-xs">{t.label}</span>
              <span className="text-lg font-semibold tabular-nums sm:text-xl">
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
        {state?.last_synced_at
          ? `Figures updated ${ago(state.last_synced_at, now)}.`
          : failing
            ? 'Figures could not be loaded from the booking site yet.'
            : 'Loading figures from the booking site. Refresh in a moment.'}
        {failing && state?.last_synced_at
          ? ' The latest refresh from the booking site failed; showing the last good figures.'
          : ''}
      </p>
    </section>
  );
}
