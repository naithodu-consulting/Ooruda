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
  '3m',
  '6m',
  'this_fy',
  'last_fy',
  'custom',
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  this_fy: 'This FY',
  last_fy: 'Last FY',
  custom: 'Custom range',
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
    case '3m': {
      const m = shiftMonth(month, -2);
      return { preset, from: `${m}-01`, to: lastDay(month) };
    }
    case '6m': {
      const m = shiftMonth(month, -5);
      return { preset, from: `${m}-01`, to: lastDay(month) };
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
  /** Taken off before GST, so revenue is base + extra MINUS this. */
  discount_amount: number;
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
  description?: string;
  vendor?: string | null;
  mode?: string;
  invoice_no?: string | null;
}

export interface ReportPayment {
  id: string;
  paid_on: string;
  mode: string;
  amount: number;
  reference: string | null;
  payer_name: string | null;
  booking_code: string | null;
}

export interface ReportRefund {
  id: string;
  refunded_on: string;
  mode: string;
  amount: number;
  reason: string;
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

  // What the guest was actually charged for the stay, before GST: a discount
  // code comes off the taxable value, so it comes off revenue too.
  const netPaise =
    paise(s.base_amount) +
    paise(s.extra_guest_amount) -
    paise(s.discount_amount);

  if (nights === total) {
    return { nights, revenuePaise: netPaise, gstPaise: paise(s.tax_amount) };
  }

  return {
    nights,
    revenuePaise: Math.round((netPaise * nights) / total),
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
  grossRevenue: number;
  expenses: number;
  net: number;
  netReceived: number;
}

export interface Overview {
  days: number;
  bookedNights: number;
  occupancyPct: number;
  revenue: number;
  gstCollected: number;
  grossRevenue: number;
  netReceived: number;
  averageNightly: number;
  grossAverageNightly: number;
  revenuePerNight: number;
  grossRevenuePerNight: number;
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
    let g = 0;
    for (const s of selling) {
      const part = slice(s, mFrom, mTo);
      n += part.nights;
      r += part.revenuePaise;
      g += part.gstPaise;
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
      grossRevenue: rupees(r + g),
      expenses: rupees(e),
      net: rupees(r - e),
      netReceived: rupees(r + g - e),
    });
  }

  const days = daysIn(range);
  const grossPaise = revenue + gst;
  const netReceivedPaise = grossPaise - spent;

  return {
    days,
    bookedNights: nights,
    occupancyPct: Math.round((nights / days) * 1000) / 10,
    revenue: rupees(revenue),
    gstCollected: rupees(gst),
    grossRevenue: rupees(grossPaise),
    netReceived: rupees(netReceivedPaise),
    averageNightly: nights ? rupees(revenue / nights) : 0,
    grossAverageNightly: nights ? rupees(grossPaise / nights) : 0,
    revenuePerNight: rupees(revenue / days),
    grossRevenuePerNight: rupees(grossPaise / days),
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
  /** All guests in the period, most stays/revenue first. */
  allGuests?: GuestLine[];
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
          (sum, s) =>
            sum +
            paise(s.base_amount) +
            paise(s.extra_guest_amount) -
            paise(s.discount_amount ?? 0),
          0,
        ),
      ),
      lastStay: latest.check_in,
    };
  });

  const returning = lines.filter((l) => l.stays > 1);
  const sortedReturning = [...returning].sort(
    (a, b) => b.stays - a.stays || b.revenue - a.revenue,
  );
  const sortedAll = [...lines].sort(
    (a, b) => b.stays - a.stays || b.revenue - a.revenue,
  );

  return {
    guests: lines.length,
    returning: returning.length,
    returningPct: lines.length
      ? Math.round((returning.length / lines.length) * 1000) / 10
      : 0,
    top: sortedReturning.slice(0, limit),
    allGuests: sortedAll,
  };
}

// ── Payments & Refunds ──────────────────────────────────────────

export interface PaymentModeLine {
  mode: string;
  count: number;
  amount: number;
  sharePct: number;
}

export interface PaymentsReport {
  totalReceived: number;
  totalRefunded: number;
  netCollected: number;
  paymentCount: number;
  refundCount: number;
  avgPayment: number;
  topMode: string | null;
  byMode: PaymentModeLine[];
  byMonth: { month: string; received: number; refunded: number; net: number }[];
  rows: ReportPayment[];
  refunds: ReportRefund[];
}

export function buildPaymentsReport(
  range: { from: string; to: string },
  payments: ReportPayment[],
  refunds: ReportRefund[],
): PaymentsReport {
  const inRangePay = payments.filter(
    (p) => p.paid_on >= range.from && p.paid_on <= range.to,
  );
  const inRangeRef = refunds.filter(
    (r) => r.refunded_on >= range.from && r.refunded_on <= range.to,
  );

  const recPaise = inRangePay.reduce((sum, p) => sum + paise(p.amount), 0);
  const refPaise = inRangeRef.reduce((sum, r) => sum + paise(r.amount), 0);
  const netPaise = recPaise - refPaise;

  const modeMap = new Map<string, { count: number; paise: number }>();
  for (const p of inRangePay) {
    const cur = modeMap.get(p.mode) ?? { count: 0, paise: 0 };
    cur.count += 1;
    cur.paise += paise(p.amount);
    modeMap.set(p.mode, cur);
  }

  const byMode: PaymentModeLine[] = [...modeMap.entries()]
    .map(([mode, v]) => ({
      mode,
      count: v.count,
      amount: rupees(v.paise),
      sharePct: recPaise > 0 ? Math.round((v.paise / recPaise) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byMonth: {
    month: string;
    received: number;
    refunded: number;
    net: number;
  }[] = [];
  for (
    let m = range.from.slice(0, 7);
    m <= range.to.slice(0, 7);
    m = shiftMonth(m, 1)
  ) {
    const mFrom = `${m}-01` < range.from ? range.from : `${m}-01`;
    const mLast = addDays(`${shiftMonth(m, 1)}-01`, -1);
    const mTo = mLast > range.to ? range.to : mLast;

    const r = inRangePay
      .filter((p) => p.paid_on >= mFrom && p.paid_on <= mTo)
      .reduce((sum, p) => sum + paise(p.amount), 0);
    const f = inRangeRef
      .filter((x) => x.refunded_on >= mFrom && x.refunded_on <= mTo)
      .reduce((sum, x) => sum + paise(x.amount), 0);

    byMonth.push({
      month: m,
      received: rupees(r),
      refunded: rupees(f),
      net: rupees(r - f),
    });
  }

  return {
    totalReceived: rupees(recPaise),
    totalRefunded: rupees(refPaise),
    netCollected: rupees(netPaise),
    paymentCount: inRangePay.length,
    refundCount: inRangeRef.length,
    avgPayment:
      inRangePay.length > 0 ? rupees(recPaise / inRangePay.length) : 0,
    topMode: byMode[0]?.mode ?? null,
    byMode,
    byMonth,
    rows: [...inRangePay].sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
    refunds: [...inRangeRef].sort((a, b) =>
      b.refunded_on.localeCompare(a.refunded_on),
    ),
  };
}

// ── GST Summary ─────────────────────────────────────────────────

export interface GstMonthLine {
  month: string;
  stays: number;
  nights: number;
  taxableRevenue: number;
  outputGst: number;
  totalWithGst: number;
  expenseAmount: number;
  inputGst: number;
  netGstPayable: number;
}

export interface GstReport {
  /** Distinct selling stays with at least one night in the period. */
  stays: number;
  /** Nights sold inside the period. */
  nights: number;
  taxableRevenue: number;
  outputGst: number;
  totalWithGst: number;
  expenseAmount: number;
  inputGst: number;
  netGstPayable: number;
  months: GstMonthLine[];
}

export function buildGstReport(
  range: { from: string; to: string },
  stays: ReportStay[],
  expenses: ReportExpense[],
): GstReport {
  const selling = stays.filter((s) => SELLING.has(s.status));
  const inRangeExpenses = expenses.filter(
    (e) => e.spent_on >= range.from && e.spent_on <= range.to,
  );

  let totalRevPaise = 0;
  let totalOutGstPaise = 0;
  let totalStays = 0;
  let totalNights = 0;

  for (const s of selling) {
    const part = slice(s, range.from, range.to);
    if (!part.nights) continue;
    totalStays += 1;
    totalNights += part.nights;
    totalRevPaise += part.revenuePaise;
    totalOutGstPaise += part.gstPaise;
  }

  const totalExpPaise = inRangeExpenses.reduce(
    (sum, e) => sum + paise(e.amount),
    0,
  );
  const totalInGstPaise = inRangeExpenses.reduce(
    (sum, e) => sum + paise(e.gst_amount),
    0,
  );

  const months: GstMonthLine[] = [];
  for (
    let m = range.from.slice(0, 7);
    m <= range.to.slice(0, 7);
    m = shiftMonth(m, 1)
  ) {
    const mFrom = `${m}-01` < range.from ? range.from : `${m}-01`;
    const mLast = addDays(`${shiftMonth(m, 1)}-01`, -1);
    const mTo = mLast > range.to ? range.to : mLast;

    let stayCount = 0;
    let nights = 0;
    let rev = 0;
    let outGst = 0;
    for (const s of selling) {
      const part = slice(s, mFrom, mTo);
      if (!part.nights) continue;
      stayCount += 1;
      nights += part.nights;
      rev += part.revenuePaise;
      outGst += part.gstPaise;
    }

    const mExp = inRangeExpenses.filter(
      (e) => e.spent_on >= mFrom && e.spent_on <= mTo,
    );
    const expPaise = mExp.reduce((sum, e) => sum + paise(e.amount), 0);
    const inGstPaise = mExp.reduce((sum, e) => sum + paise(e.gst_amount), 0);

    months.push({
      month: m,
      stays: stayCount,
      nights,
      taxableRevenue: rupees(rev),
      outputGst: rupees(outGst),
      totalWithGst: rupees(rev + outGst),
      expenseAmount: rupees(expPaise),
      inputGst: rupees(inGstPaise),
      netGstPayable: rupees(outGst - inGstPaise),
    });
  }

  return {
    // Counted over the whole period, NOT as the sum of the month rows: a stay
    // that spans two months appears in both, so adding the rows up would
    // count it twice.
    stays: totalStays,
    nights: totalNights,
    taxableRevenue: rupees(totalRevPaise),
    outputGst: rupees(totalOutGstPaise),
    totalWithGst: rupees(totalRevPaise + totalOutGstPaise),
    expenseAmount: rupees(totalExpPaise),
    inputGst: rupees(totalInGstPaise),
    netGstPayable: rupees(totalOutGstPaise - totalInGstPaise),
    months,
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
