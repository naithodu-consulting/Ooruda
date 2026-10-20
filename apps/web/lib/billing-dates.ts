/**
 * Billing day-boundary helpers.
 *
 * Bills carry a Postgres `date` (`due_date`) with no time component, which
 * PostgREST returns as a plain `'YYYY-MM-DD'` string. The naive
 * `new Date('2026-06-10')` parses that as **UTC midnight**, and a follow-up
 * `.setHours(0, 0, 0, 0)` then re-anchors it to the **server's local**
 * midnight - so any "days overdue" math silently depends on where the server
 * is hosted (a UTC host and an IST host disagree by up to a day near
 * midnight).
 *
 * These helpers work purely from `'YYYY-MM-DD'` strings, comparing them in
 * UTC, so the result is identical regardless of the host timezone. "Today" is
 * resolved in a fixed billing timezone (Ooruda associations bill in India,
 * so day boundaries follow IST), not the host's.
 */

// Ooruda bills in India; calendar-day boundaries follow IST.
export const BILLING_TIME_ZONE = 'Asia/Kolkata';

/**
 * Today's date as `'YYYY-MM-DD'` in the billing timezone, independent of the
 * server's own timezone. (`en-CA` formats dates as `YYYY-MM-DD`.)
 */
export function todayInBillingZone(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: BILLING_TIME_ZONE });
}

/**
 * Whole days from `fromYmd` to `toYmd` (both `'YYYY-MM-DD'`), computed in UTC
 * so it never depends on the host timezone. Positive when `toYmd` is later.
 * Returns `0` for unparseable input.
 */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = ymdToUTC(fromYmd);
  const to = ymdToUTC(toYmd);

  if (from === null || to === null) {
    return 0;
  }

  return Math.floor((to - from) / 86_400_000);
}

/**
 * Format a `'YYYY-MM-DD'` string as e.g. `10 Jun 2026`, without round-tripping
 * through a timezone-sensitive local `Date` (which can shift the day on hosts
 * behind UTC).
 */
export function formatYmdLong(ymd: string): string {
  const utc = ymdToUTC(ymd);

  if (utc === null) {
    return ymd;
  }

  return new Date(utc).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ymdToUTC(ymd: string): number | null {
  const [year, month, day] = ymd.slice(0, 10).split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}
