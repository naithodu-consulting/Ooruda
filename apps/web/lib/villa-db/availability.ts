import 'server-only';
import type { VillaSite } from './client';
import { nightsIn } from './dates';
import { fromSiteError, VillaDbError } from './errors';

/**
 * Availability, read through the villa-booking database's own functions —
 * the same ones the guest site's checkout uses — so Ooruda's calendar and the
 * site cannot disagree (integration contract §8). Never re-implement the
 * overlap rule here.
 */

export type Availability = 'AVAILABLE' | 'DATE_UNAVAILABLE' | 'DATE_BLOCKED';

/** The site API caps a calendar window at 186 nights. */
export const MAX_WINDOW_NIGHTS = 186;

/** Can the stay [checkIn, checkOut) be booked right now? */
export async function checkAvailability(
  site: VillaSite,
  checkIn: string,
  checkOut: string,
): Promise<Availability> {
  nightsIn(checkIn, checkOut);

  const { data, error } = await site.client.rpc('check_availability', {
    p_property_id: site.sitePropertyId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });

  if (error) throw fromSiteError(error);

  if (
    data === 'AVAILABLE' ||
    data === 'DATE_UNAVAILABLE' ||
    data === 'DATE_BLOCKED'
  ) {
    return data;
  }

  throw new VillaDbError(
    'UNKNOWN',
    `unexpected check_availability result: ${String(data)}`,
  );
}

/** Every taken night in [from, to) — bookings, live holds and blocks. */
export async function getUnavailableNights(
  site: VillaSite,
  from: string,
  to: string,
): Promise<string[]> {
  const nights = nightsIn(from, to);

  if (nights > MAX_WINDOW_NIGHTS) {
    throw new VillaDbError(
      'INVALID_INPUT',
      `window of ${nights} nights exceeds ${MAX_WINDOW_NIGHTS}`,
      `Pick a window of at most ${MAX_WINDOW_NIGHTS} nights.`,
    );
  }

  const { data, error } = await site.client.rpc('get_unavailable_nights', {
    p_property_id: site.sitePropertyId,
    p_from: from,
    p_to: to,
  });

  if (error) throw fromSiteError(error);

  return (data ?? []) as string[];
}

/** Throws the matching error unless [checkIn, checkOut) is free. */
export async function assertAvailable(
  site: VillaSite,
  checkIn: string,
  checkOut: string,
): Promise<void> {
  const status = await checkAvailability(site, checkIn, checkOut);

  if (status !== 'AVAILABLE') {
    throw new VillaDbError(status, `${checkIn} → ${checkOut}`);
  }
}
