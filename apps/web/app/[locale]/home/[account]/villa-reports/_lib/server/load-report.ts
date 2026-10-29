import 'server-only';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { addDays } from '~/lib/villa-db/dates';
import {
  type ChannelLine,
  type GstReport,
  type GuestsReport,
  type Overview,
  type PaymentsReport,
  type ReportExpense,
  type ReportRange,
  type ReportStay,
  buildChannels,
  buildGstReport,
  buildGuests,
  buildOverview,
  buildPaymentsReport,
} from '~/lib/villa/reports';

export type ReportTabKey =
  | 'overview'
  | 'expenses'
  | 'payments'
  | 'gst_summary'
  | 'channels'
  | 'guests';

export const REPORT_TABS: ReportTabKey[] = [
  'overview',
  'expenses',
  'payments',
  'gst_summary',
  'channels',
  'guests',
];

export const REPORT_TAB_TITLES: Record<ReportTabKey, string> = {
  overview: 'Revenue & Occupancy',
  expenses: 'Expenses',
  payments: 'Payments & Refunds',
  gst_summary: 'GST Summary',
  channels: 'Booking Channels',
  guests: 'Guest Directory',
};

const STAY_COLUMNS =
  'status, booking_kind, channel, check_in, check_out, nights, base_amount, extra_guest_amount, discount_amount, tax_amount, guest_name, guest_phone, booking_code';

/** PostgREST returns at most 1000 rows per request: page until done. */
const PAGE = 1000;
const MAX_ROWS = 100_000;

async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const rows: T[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);

    if (error) return { data: rows, error };

    rows.push(...(data ?? []));

    if (!data || data.length < PAGE) return { data: rows, error: null };
  }

  return {
    data: rows,
    error: { message: `report exceeds ${MAX_ROWS} rows` },
  };
}

const toStay = (r: Record<string, unknown>): ReportStay => ({
  ...(r as unknown as ReportStay),
  base_amount: Number(r.base_amount),
  discount_amount: Number(r.discount_amount ?? 0),
  extra_guest_amount: Number(r.extra_guest_amount),
  tax_amount: Number(r.tax_amount),
});

export interface VillaReportData {
  overview: Overview;
  expenses: ReportExpense[];
  payments: PaymentsReport | null;
  gst: GstReport | null;
  channels: ChannelLine[];
  guests: GuestsReport | null;
}

/**
 * Reads the bookings mirror, expenses, payments and refunds for one property
 * and builds the figures behind a single report tab.
 *
 * The caller decides whether the mirror needs refreshing first. The page does
 * that before it reads; the export does not, so it reports the mirror as that
 * page load left it. An export from a tab left open across a sync is
 * therefore as stale as the figures still on screen beside it - which is the
 * trade this makes deliberately, because refreshing costs the export the
 * mirror's whole bounded sync budget.
 */
export async function loadVillaReportData(args: {
  propertyId: string;
  tab: ReportTabKey;
  range: ReportRange;
}): Promise<VillaReportData> {
  const { propertyId, tab, range } = args;
  const client = getSupabaseServerClient();
  const end = addDays(range.to, 1);

  const [
    staysResult,
    expensesResult,
    historyResult,
    paymentsResult,
    refundsResult,
  ] = await Promise.all([
    fetchAll((a, b) =>
      client
        .from('villa_bookings_mirror')
        .select(STAY_COLUMNS)
        .eq('property_id', propertyId)
        .in('status', ['confirmed', 'completed'])
        .lt('check_in', end)
        .gt('check_out', range.from)
        .order('site_booking_id')
        .range(a, b),
    ),
    fetchAll((a, b) =>
      client
        .from('villa_expenses')
        .select(
          'spent_on, category, amount, gst_amount, description, vendor, mode, invoice_no',
        )
        .eq('property_id', propertyId)
        .gte('spent_on', range.from)
        .lte('spent_on', range.to)
        .order('spent_on', { ascending: false })
        // fetchAll pages with .range(): spent_on is not unique, so without a
        // tiebreaker rows can shift between pages and be dropped or doubled.
        .order('id')
        .range(a, b),
    ),
    // Returning guests need every past stay, only on that tab.
    tab === 'guests'
      ? fetchAll((a, b) =>
          client
            .from('villa_bookings_mirror')
            .select(STAY_COLUMNS)
            .eq('property_id', propertyId)
            .in('status', ['confirmed', 'completed'])
            .lt('check_in', end)
            .order('site_booking_id')
            .range(a, b),
        )
      : Promise.resolve({ data: [], error: null }),
    tab === 'payments'
      ? fetchAll((a, b) =>
          client
            .from('villa_booking_payments')
            .select(
              'id, paid_on, mode, amount, reference, payer_name, booking_code',
            )
            .eq('property_id', propertyId)
            .is('voided_at', null)
            .gte('paid_on', range.from)
            .lte('paid_on', range.to)
            .order('paid_on', { ascending: false })
            .order('id')
            .range(a, b),
        )
      : Promise.resolve({ data: [], error: null }),
    tab === 'payments'
      ? fetchAll((a, b) =>
          client
            .from('villa_refunds')
            .select('id, refunded_on, mode, amount, reason')
            .eq('property_id', propertyId)
            .neq('status', 'failed')
            .gte('refunded_on', range.from)
            .lte('refunded_on', range.to)
            .order('refunded_on', { ascending: false })
            .order('id')
            .range(a, b),
        )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error =
    staysResult.error ??
    expensesResult.error ??
    historyResult.error ??
    paymentsResult.error ??
    refundsResult.error;

  if (error) {
    throw new VillaReportLoadError(error.code ?? null, error.message);
  }

  const stays = (staysResult.data ?? []).map(toStay);
  const expenses = (expensesResult.data ?? []).map((e) => ({
    spent_on: e.spent_on,
    category: e.category,
    amount: Number(e.amount),
    gst_amount: Number(e.gst_amount),
    description: e.description,
    vendor: e.vendor,
    mode: e.mode,
    invoice_no: e.invoice_no,
  }));
  const payments = (paymentsResult.data ?? []).map((p) => ({
    id: p.id,
    paid_on: p.paid_on,
    mode: p.mode,
    amount: Number(p.amount),
    reference: p.reference,
    payer_name: p.payer_name,
    booking_code: p.booking_code,
  }));
  const refunds = (refundsResult.data ?? []).map((r) => ({
    id: r.id,
    refunded_on: r.refunded_on,
    mode: r.mode,
    amount: Number(r.amount),
    reason: r.reason,
  }));

  return {
    overview: buildOverview(range, stays, expenses),
    expenses,
    payments:
      tab === 'payments' ? buildPaymentsReport(range, payments, refunds) : null,
    gst: tab === 'gst_summary' ? buildGstReport(range, stays, expenses) : null,
    channels: tab === 'channels' ? buildChannels(range, stays) : [],
    guests:
      tab === 'guests'
        ? buildGuests(range, (historyResult.data ?? []).map(toStay), 1000)
        : null,
  };
}

/** Carries the PostgREST code so callers can log it without re-wrapping. */
export class VillaReportLoadError extends Error {
  constructor(
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'VillaReportLoadError';
  }
}
