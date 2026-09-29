import { daysBetweenYmd, todayInBillingZone } from '~/lib/billing-dates';

import { VillaDbError } from './errors';

/**
 * Date ranges on the villa-booking database (integration contract §3):
 *   - Indian calendar dates, 'YYYY-MM-DD', no time or timezone
 *   - half-open [start, end): `end` is the check-out morning, not a night
 *   - a range with end == start covers zero nights and must not be written
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isYmd(value: string): boolean {
  const match = YMD.exec(value);

  if (!match) return false;

  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Nights in the half-open range [from, to). Throws INVALID_INPUT for a
 * malformed date or a range of fewer than one night.
 */
export function nightsIn(from: string, to: string): number {
  if (!isYmd(from) || !isYmd(to)) {
    throw new VillaDbError('INVALID_INPUT', `bad date: ${from} → ${to}`);
  }

  const nights = daysBetweenYmd(from, to);

  if (nights < 1) {
    throw new VillaDbError(
      'INVALID_INPUT',
      `range must cover at least one night: ${from} → ${to}`,
      'The end date must be after the start date.',
    );
  }

  return nights;
}

/** 'YYYY-MM-DD' plus `days`, in UTC so the host timezone never matters. */
export function addDays(ymd: string, days: number): string {
  if (!isYmd(ymd)) {
    throw new VillaDbError('INVALID_INPUT', `bad date: ${ymd}`);
  }

  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));

  return date.toISOString().slice(0, 10);
}

/** Every night in [from, to), as 'YYYY-MM-DD'. */
export function nightsList(from: string, to: string): string[] {
  const count = nightsIn(from, to);

  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/** Today in India — the only correct "today" for the booking site. */
export function todayIst(now?: Date): string {
  return todayInBillingZone(now);
}
