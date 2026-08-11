import { BILLING_TIME_ZONE } from './billing-dates';

/**
 * Format a `'YYYY-MM-DD'` string as `'DD-MM-YYYY'`. Pure string
 * reformatting — never round-trips through a `Date`, so it can't shift the
 * day across timezones. Only safe for date-only strings (no time
 * component) — use `formatTimestampDMY` for full timestamps.
 */
/**
 * Format a `'YYYY-MM-DD'` string as `'5 Aug 2026'` — human-readable, no
 * timezone conversion (date-only input is already local).
 */
export function formatDateReadable(ymd: string): string {
  const [year, month, day] = ymd.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateDMY(ymd: string): string {
  const [year, month, day] = ymd.slice(0, 10).split('-');

  if (!year || !month || !day) {
    return ymd;
  }

  return `${day}-${month}-${year}`;
}

function timestampParts(iso: string): Intl.DateTimeFormatPart[] | null {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BILLING_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
}

/**
 * Format an ISO timestamp's date portion as `'DD-MM-YYYY'`, resolved in the
 * fixed billing timezone — unlike `formatDateDMY`, this is safe for
 * timestamps (not just date-only strings), since it doesn't naively slice
 * the UTC string (which can land on the wrong calendar day in IST).
 */
export function formatTimestampDateDMY(iso: string): string {
  const parts = timestampParts(iso);

  if (!parts) {
    return iso;
  }

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return `${get('day')}-${get('month')}-${get('year')}`;
}

/**
 * Format an ISO timestamp as `'DD-MM-YYYY, HH:mm'` in the `en-IN` locale.
 */
export function formatTimestampDMY(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const dateStr = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

  const formattedDate = dateStr.replace(/\//g, '-');

  return `${formattedDate}, ${timeStr}`;
}
