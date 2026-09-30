import { daysBetweenYmd } from '~/lib/billing-dates';
import { addDays, isYmd } from '~/lib/villa-db/dates';

import { shiftMonth } from './calendar';

/**
 * Villa reports, from the bookings mirror and Ooruda's own tables. Pure: the
 * page loads rows, these turn them into numbers, so every rule is tested.
 *
 * Rules (same as the dashboard):
 *   - a report period is whole days [from, to] inclusive (India dates);
 *   - a stay counts by the NIGHTS inside the period, and its revenue pro rata;
 *   - only stays that sold nights count: confirmed and checked out;
 *   - revenue is before GST (stay + extra guests); GST is shown apart.
 */

// ── Periods ─────────────────────────────────────────────────────

export const REPORT_PRESETS = [
  'this_month',
  'last_month',
  'this_fy',
  'last_fy',
  'custom',
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_fy: 'This financial year',
  last_fy: 'Last financial year',
  custom: 'Custom',
};

export interface ReportRange {
  preset: ReportPreset;
  /** A custom range was asked for but was not valid; this month is shown. */
  invalid?: boolean;
  /** First day, inclusive. */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

/** Longest custom range allowed (keeps a report fast). */
export const MAX_REPORT_DAYS = 3 * 366;

function fyStartYear(today: string): number {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return m >= 4 ? y : y - 1;
}

/** Resolves a preset (or a checked custom range) against India's today. */
export function resolveReportRange(
  input: { preset?: string; from?: string; to?: string },
  today: string,
): ReportRange {
  const preset = (REPORT_PRESETS as readonly string[]).includes(
    input.preset ?? '',
  )
    ? (input.preset as ReportPreset)
    : 'this_month';

  const month = today.slice(0, 7);
  const lastDay = (m: string) => addDays(`${shiftMonth(m, 1)}-01`, -1);

  switch (preset) {
    case 'last_month': {
      const m = shiftMonth(month, -1);
      return { preset, from: `${m}-01`, to: lastDay(m) };
    }
    case 'this_fy': {
      const y = fyStartYear(today);
      return { preset, from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case 'last_fy': {
      const y = fyStartYear(today) - 1;
      return { preset, from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case 'custom': {
      const { from, to } = input;
      if (
        from &&
        to &&
        isYmd(from) &&
        isYmd(to) &&
        from <= to &&
        daysBetweenYmd(from, to) < MAX_REPORT_DAYS
      ) {
        return { preset, from, to };
      }
      return {
        preset: 'this_month',
        from: `${month}-01`,
        to: lastDay(month),
        invalid: true,
      };
    }
    default:
      return { preset: 'this_month', from: `${month}-01`, to: lastDay(month) };
  }
}

/** Days (= available nights for a whole villa) in the period. */
export function daysIn(range: { from: string; to: string }): number {
  return daysBetweenYmd(range.from, range.to) + 1;
}

// ── Rows ────────────────────────────────────────────────────────

export interface ReportStay {
  status: string;
  booking_kind: string;
  channel: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  base_amount: number;
  extra_guest_amount: number;
  tax_amount: number;
  guest_name: string;
  guest_phone: string | null;
  booking_code: string | null;
}

export interface ReportExpense {
  spent_on: string;
  category: string;
  amount: number;
  gst_amount: number;
}

const SELLING = new Set(['confirmed', 'completed']);
const paise = (rupees: number) => Math.round(Number(rupees) * 100);
const rupees = (p: number) => Math.round(p) / 100;

/**
 * Nights of a stay inside [from, to] (inclusive days), and its share of the
 * stay's money, rounded to whole paise so month lines add up to the total.
 * The stay's length comes from its dates, never from a stored night count.
 */
function slice(s: ReportStay, from: string, toInclusive: string) {
  const end = addDays(toInclusive, 1);
  const start = s.check_in > from ? s.check_in : from;
  const stop = s.check_out < end ? s.check_out : end;
  const nights = start < stop ? daysBetweenYmd(start, stop) : 0;
  const total = daysBetweenYmd(s.check_in, s.check_out);

  if (nights === 0 || total <= 0) {
    return { nights: 0, revenuePaise: 0, gstPaise: 0 };
  }

  if (nights === total) {
    return {
      nights,
      revenuePaise: paise(s.base_amount) + paise(s.extra_guest_amount),
      gstPaise: paise(s.tax_amount),
    };
  }

  return {
    nights,
    revenuePaise: Math.round(
      ((paise(s.base_amount) + paise(s.extra_guest_amount)) * nights) / total,
    ),
    gstPaise: Math.round((paise(s.tax_amount) * nights) / total),
  };
}

// ── Overview ────────────────────────────────────────────────────

export interface MonthLine {
  month: string;
  nights: number;
  available: number;
  occupancyPct: number;
  revenue: number;
  expenses: number;
  net: number;
}

export interface Overview {
  days: number;
  bookedNights: number;
  occupancyPct: number;
  revenue: number;
  gstCollected: number;
  averageNightly: number;
  revenuePerNight: number;
  stays: number;
  events: number;
  expenses: number;
  expensesGst: number;
  net: number;
  months: MonthLine[];
  expensesByCategory: { category: string; amount: number }[];
}

export function buildOverview(
  range: { from: string; to: string },
  stays: ReportStay[],
  expenses: ReportExpense[],
): Overview {
  const selling = stays.filter((s) => SELLING.has(s.status));

  let nights = 0;
  let revenue = 0;
  let gst = 0;
  let count = 0;
  let events = 0;

  for (const s of selling) {
    const part = slice(s, range.from, range.to);
    if (!part.nights) continue;
    count++;
    if (s.booking_kind === 'event') events++;
    nights += part.nights;
    revenue += part.revenuePaise;
    gst += part.gstPaise;
  }

  const inRange = expenses.filter(
    (e) => e.spent_on >= range.from && e.spent_on <= range.to,
  );
  const spent = inRange.reduce((sum, e) => sum + paise(e.amount), 0);
  const spentGst = inRange.reduce((sum, e) => sum + paise(e.gst_amount), 0);

  const byCategory = new Map<string, number>();
  for (const e of inRange) {
    byCategory.set(
      e.category,
      (byCategory.get(e.category) ?? 0) + paise(e.amount),
    );
  }

  // Month lines, each clipped to the period.
  const months: MonthLine[] = [];
  for (
    let m = range.from.slice(0, 7);
    m <= range.to.slice(0, 7);
    m = shiftMonth(m, 1)
  ) {
    const mFrom = `${m}-01` < range.from ? range.from : `${m}-01`;
    const mLast = addDays(`${shiftMonth(m, 1)}-01`, -1);
    const mTo = mLast > range.to ? range.to : mLast;

    let n = 0;
    let r = 0;
    for (const s of selling) {
      const part = slice(s, mFrom, mTo);
      n += part.nights;
      r += part.revenuePaise;
    }

    const e = inRange
      .filter((x) => x.spent_on >= mFrom && x.spent_on <= mTo)
      .reduce((sum, x) => sum + paise(x.amount), 0);
    const available = daysBetweenYmd(mFrom, mTo) + 1;

    months.push({
      month: m,
      nights: n,
      available,
      occupancyPct: Math.round((n / available) * 1000) / 10,
      revenue: rupees(r),
      expenses: rupees(e),
      net: rupees(r - e),
    });
  }

  const days = daysIn(range);

  return {
    days,
    bookedNights: nights,
    occupancyPct: Math.round((nights / days) * 1000) / 10,
    revenue: rupees(revenue),
    gstCollected: rupees(gst),
    averageNightly: nights ? rupees(revenue / nights) : 0,
    revenuePerNight: rupees(revenue / days),
    stays: count,
    events,
    expenses: rupees(spent),
    expensesGst: rupees(spentGst),
    net: rupees(revenue - spent),
    months,
    expensesByCategory: [...byCategory.entries()]
      .map(([category, p]) => ({ category, amount: rupees(p) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ── Channels ────────────────────────────────────────────────────

export interface ChannelLine {
  channel: string;
  stays: number;
  nights: number;
  revenue: number;
  sharePct: number;
}

export function buildChannels(
  range: { from: string; to: string },
  stays: ReportStay[],
): ChannelLine[] {
  const lines = new Map<
    string,
    { stays: number; nights: number; paise: number }
  >();

  for (const s of stays) {
    if (!SELLING.has(s.status)) continue;
    const part = slice(s, range.from, range.to);
    if (!part.nights) continue;

    const key = s.channel ?? 'other';
    const line = lines.get(key) ?? { stays: 0, nights: 0, paise: 0 };
    line.stays++;
    line.nights += part.nights;
    line.paise += part.revenuePaise;
    lines.set(key, line);
  }

  const total = [...lines.values()].reduce((sum, l) => sum + l.paise, 0);

  return [...lines.entries()]
    .map(([channel, l]) => ({
      channel,
      stays: l.stays,
      nights: l.nights,
      revenue: rupees(l.paise),
      sharePct: total ? Math.round((l.paise / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── Guests ──────────────────────────────────────────────────────

export interface GuestLine {
  name: string;
  phone: string | null;
  stays: number;
  nights: number;
  revenue: number;
  lastStay: string;
}

export interface GuestsReport {
  guests: number;
  returning: number;
  returningPct: number;
  /** Returning guests in the period, most stays first. */
  top: GuestLine[];
}

/**
 * The same guest across stays: Indian mobiles by their 10 digits (+91 98765
 * 43210, 098765 43210 and 9876543210 match), other numbers in full. A stay
 * without a usable phone is its own guest: names alone never merge people.
 */
function guestKey(s: ReportStay): string {
  const digits = (s.guest_phone ?? '').replace(/\D/g, '');
  const indian = digits.replace(/^(91|0)(?=[6-9]\d{9}$)/, '');

  if (/^[6-9]\d{9}$/.test(indian)) return `in:${indian}`;
  if (digits.length >= 8) return `intl:${digits}`;

  return `stay:${s.booking_code ?? `${s.guest_name}|${s.check_in}`}`;
}

/**
 * Guests who stayed in the period, and which of them have stayed more than
 * once EVER (`history` is every selling stay, not only this period's).
 */
export function buildGuests(
  range: { from: string; to: string },
  history: ReportStay[],
  limit = 20,
): GuestsReport {
  const end = addDays(range.to, 1);
  const selling = history.filter((s) => SELLING.has(s.status));

  const all = new Map<string, ReportStay[]>();
  for (const s of selling) {
    const k = guestKey(s);
    all.set(k, [...(all.get(k) ?? []), s]);
  }

  const inPeriod = new Set(
    selling
      .filter((s) => s.check_in < end && s.check_out > range.from)
      .map(guestKey),
  );

  const lines: GuestLine[] = [...inPeriod].map((k) => {
    const list = all.get(k) ?? [];
    const latest = list.reduce((a, b) => (a.check_in > b.check_in ? a : b));
    return {
      name: latest.guest_name,
      phone: latest.guest_phone,
      stays: list.length,
      nights: list.reduce(
        (sum, s) => sum + daysBetweenYmd(s.check_in, s.check_out),
        0,
      ),
      revenue: rupees(
        list.reduce(
          (sum, s) => sum + paise(s.base_amount) + paise(s.extra_guest_amount),
          0,
        ),
      ),
      lastStay: latest.check_in,
    };
  });

  const returning = lines.filter((l) => l.stays > 1);

  return {
    guests: lines.length,
    returning: returning.length,
    returningPct: lines.length
      ? Math.round((returning.length / lines.length) * 1000) / 10
      : 0,
    top: returning
      .sort((a, b) => b.stays - a.stays || b.revenue - a.revenue)
      .slice(0, limit),
  };
}

// ── CSV ─────────────────────────────────────────────────────────

/** RFC 4180 CSV; cells that look like formulas are neutralised. */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? '' : String(v);
    if (typeof v === 'string' && /^\s*[=+\-@]|^[\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
