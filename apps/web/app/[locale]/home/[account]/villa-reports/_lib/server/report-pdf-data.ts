import type {
  VillaReportPdfData,
  VillaReportSection,
} from '@kit/pdf-templates';

import { formatDateReadable } from '~/lib/format-date';
import { channelLabel, paymentModeLabel } from '~/lib/villa/labels';
import type { ReportRange } from '~/lib/villa/reports';

import { EXPENSE_CATEGORY_LABELS } from '../../../villa-expenses/_lib/schemas/villa-expenses.schema';
import {
  REPORT_TAB_TITLES,
  type ReportTabKey,
  type VillaReportData,
} from './load-report';

/**
 * Flattens whichever report tab was open into the KPI tiles and tables the
 * PDF document sets.
 *
 * Kept out of the 'use server' action beside it: a file marked 'use server'
 * may only export async functions, and this is the part worth testing on its
 * own - it is where a column can quietly end up in the wrong order or a total
 * stop matching the rows above it.
 */
const categoryLabel = (c: string) =>
  EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS] ?? c;

/** Plain numbers: the PDF is read, not re-imported, so symbols stay in. */
const inr = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;

const monthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const pct = (n: number) => `${n}%`;

/**
 * Rows per table in the PDF.
 *
 * The tables that grow with the villa - expenses, payments, refunds, guests -
 * are otherwise unbounded, and the loader's own ceiling is 100,000 rows.
 * Rendering that many @react-pdf rows and base64-ing the result would exhaust
 * the function's memory or wall clock, and the reader would see nothing but
 * "Could not generate the PDF."
 *
 * So a long table is cut here and says so. Every total in the document is
 * computed from the full set before this runs, so a capped table still adds
 * up to the real figure; the CSV export stays the complete record.
 */
const MAX_PDF_ROWS = 500;

/**
 * Caps a table and returns the note that explains the cut, or no note at all
 * when everything fits.
 */
function capRows(
  rows: string[][],
  noun: string,
  order = 'newest first',
): { rows: string[][]; note?: string } {
  if (rows.length <= MAX_PDF_ROWS) return { rows };

  const shown = rows.length.toLocaleString('en-IN');

  return {
    rows: rows.slice(0, MAX_PDF_ROWS),
    note: `Showing the first ${MAX_PDF_ROWS} of ${shown} ${noun}, ${order}. The totals below cover all of them; download the CSV for the full list.`,
  };
}

export function buildPdfData(
  tab: ReportTabKey,
  range: ReportRange,
  villaName: string,
  generatedBy: string,
  data: VillaReportData,
): VillaReportPdfData {
  const o = data.overview;
  const periodLabel = `${formatDateReadable(range.from)} – ${formatDateReadable(range.to)}`;

  const base = {
    villaName,
    // Every unmatched tab falls through to the overview below, so the title
    // has to fall the same way: keyed straight off `tab`, an unknown one gave
    // the document an `undefined` title and a blank line where the heading
    // belongs.
    title: REPORT_TAB_TITLES[tab] ?? REPORT_TAB_TITLES.overview,
    periodLabel,
    generatedAt: new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }),
    generatedBy,
  };

  if (tab === 'expenses') {
    const rows = data.expenses;
    const total = rows.reduce((s, e) => s + e.amount, 0);
    const gst = rows.reduce((s, e) => s + e.gst_amount, 0);

    const byCategory: VillaReportSection = {
      title: 'By category',
      columns: [
        { label: 'Category', width: 2 },
        { label: 'Entries', align: 'right' },
        { label: 'Amount', align: 'right' },
      ],
      rows: o.expensesByCategory.map((c) => [
        categoryLabel(c.category),
        String(rows.filter((e) => e.category === c.category).length),
        inr(c.amount),
      ]),
      total: ['Total', String(rows.length), inr(total)],
    };

    return {
      ...base,
      kpis: [
        { label: 'Total expenses', value: inr(total) },
        { label: 'Input GST', value: inr(gst) },
        { label: 'Entries', value: String(rows.length) },
        {
          label: 'Categories',
          value: String(o.expensesByCategory.length),
        },
      ],
      sections: [
        byCategory,
        {
          title: 'All expenses',
          columns: [
            { label: 'Date' },
            { label: 'Category' },
            { label: 'Description', width: 2 },
            { label: 'Vendor' },
            { label: 'Mode' },
            { label: 'Invoice no' },
            { label: 'Amount', align: 'right' },
            { label: 'GST paid', align: 'right' },
          ],
          ...capRows(
            rows.map((e) => [
              formatDateReadable(e.spent_on),
              categoryLabel(e.category),
              e.description ?? '—',
              e.vendor ?? '—',
              paymentModeLabel(e.mode ?? 'other'),
              e.invoice_no ?? '—',
              inr(e.amount),
              inr(e.gst_amount),
            ]),
            'expenses',
          ),
          total: ['Total', '', '', '', '', '', inr(total), inr(gst)],
          emptyText: 'No expenses recorded in this period.',
        },
      ],
    };
  }

  if (tab === 'payments' && data.payments) {
    const p = data.payments;

    return {
      ...base,
      kpis: [
        {
          label: 'Received',
          value: inr(p.totalReceived),
          sub: `${p.paymentCount} payments`,
        },
        {
          label: 'Refunded',
          value: inr(p.totalRefunded),
          sub: `${p.refundCount} refunds`,
        },
        { label: 'Net collected', value: inr(p.netCollected) },
        { label: 'Average payment', value: inr(p.avgPayment) },
      ],
      sections: [
        {
          title: 'By payment mode',
          columns: [
            { label: 'Mode', width: 2 },
            { label: 'Payments', align: 'right' },
            { label: 'Amount', align: 'right' },
            { label: 'Share', align: 'right' },
          ],
          rows: p.byMode.map((m) => [
            paymentModeLabel(m.mode),
            String(m.count),
            inr(m.amount),
            pct(m.sharePct),
          ]),
        },
        {
          title: 'Payments received',
          columns: [
            { label: 'Date' },
            { label: 'Booking' },
            { label: 'Payer', width: 2 },
            { label: 'Mode' },
            { label: 'Reference' },
            { label: 'Amount', align: 'right' },
          ],
          ...capRows(
            p.rows.map((r) => [
              formatDateReadable(r.paid_on),
              r.booking_code ?? '—',
              r.payer_name ?? '—',
              paymentModeLabel(r.mode),
              r.reference ?? '—',
              inr(r.amount),
            ]),
            'payments',
          ),
          total: ['Total', '', '', '', '', inr(p.totalReceived)],
          emptyText: 'No payments received in this period.',
        },
        {
          title: 'Refunds',
          columns: [
            { label: 'Date' },
            { label: 'Mode' },
            { label: 'Reason', width: 3 },
            { label: 'Amount', align: 'right' },
          ],
          ...capRows(
            p.refunds.map((r) => [
              formatDateReadable(r.refunded_on),
              paymentModeLabel(r.mode),
              r.reason ?? '—',
              inr(r.amount),
            ]),
            'refunds',
          ),
          total: ['Total', '', '', inr(p.totalRefunded)],
          emptyText: 'No refunds in this period.',
        },
      ],
    };
  }

  if (tab === 'gst_summary' && data.gst) {
    const g = data.gst;

    return {
      ...base,
      kpis: [
        {
          label: 'Taxable revenue',
          value: inr(g.taxableRevenue),
          sub: `${g.nights} nights`,
        },
        { label: 'Output GST', value: inr(g.outputGst) },
        { label: 'Input GST', value: inr(g.inputGst), sub: 'On expenses' },
        { label: 'Net GST payable', value: inr(g.netGstPayable) },
      ],
      sections: [
        {
          title: 'Month by month',
          note: 'Output GST on stays, less input GST on expenses recorded in the same month.',
          columns: [
            { label: 'Month', width: 1.3 },
            { label: 'Stays', align: 'right' },
            { label: 'Nights', align: 'right' },
            { label: 'Taxable revenue', align: 'right', width: 1.4 },
            { label: 'Output GST', align: 'right', width: 1.2 },
            { label: 'Total with GST', align: 'right', width: 1.4 },
            { label: 'Expenses', align: 'right', width: 1.2 },
            { label: 'Input GST', align: 'right', width: 1.2 },
            { label: 'Net payable', align: 'right', width: 1.3 },
          ],
          rows: g.months.map((m) => [
            monthLabel(m.month),
            String(m.stays),
            String(m.nights),
            inr(m.taxableRevenue),
            inr(m.outputGst),
            inr(m.totalWithGst),
            inr(m.expenseAmount),
            inr(m.inputGst),
            inr(m.netGstPayable),
          ]),
          total: [
            'Total',
            String(g.stays),
            String(g.nights),
            inr(g.taxableRevenue),
            inr(g.outputGst),
            inr(g.totalWithGst),
            inr(g.expenseAmount),
            inr(g.inputGst),
            inr(g.netGstPayable),
          ],
          emptyText: 'No stays or expenses in this period.',
        },
      ],
    };
  }

  if (tab === 'channels') {
    const c = data.channels;
    const stays = c.reduce((s, l) => s + l.stays, 0);
    const nights = c.reduce((s, l) => s + l.nights, 0);
    const revenue = c.reduce((s, l) => s + l.revenue, 0);
    const top = c[0];

    return {
      ...base,
      kpis: [
        { label: 'Stays', value: String(stays) },
        { label: 'Nights sold', value: String(nights) },
        { label: 'Revenue before GST', value: inr(revenue) },
        {
          label: 'Top channel',
          value: top ? channelLabel(top.channel) : '—',
          sub: top ? `${top.sharePct}% of revenue` : undefined,
        },
      ],
      sections: [
        {
          title: 'Revenue by channel',
          columns: [
            { label: 'Channel', width: 2 },
            { label: 'Stays', align: 'right' },
            { label: 'Nights', align: 'right' },
            { label: 'Revenue before GST', align: 'right', width: 1.6 },
            { label: 'Share', align: 'right' },
          ],
          rows: c.map((l) => [
            channelLabel(l.channel),
            String(l.stays),
            String(l.nights),
            inr(l.revenue),
            pct(l.sharePct),
          ]),
          total: ['Total', String(stays), String(nights), inr(revenue), '100%'],
          emptyText: 'No stays in this period.',
        },
      ],
    };
  }

  if (tab === 'guests' && data.guests) {
    const g = data.guests;
    const list = g.allGuests ?? g.top;
    // The directory is ordered by stays, so the cap keeps the most frequent
    // guests rather than the most recent ones.
    const guests = capRows(
      list.map((x) => [
        x.name,
        x.phone ?? '—',
        String(x.stays),
        String(x.nights),
        inr(x.revenue),
        x.lastStay ? formatDateReadable(x.lastStay) : '—',
      ]),
      'guests',
      'most stays first',
    );

    return {
      ...base,
      kpis: [
        { label: 'Guests', value: String(g.guests) },
        { label: 'Returning guests', value: String(g.returning) },
        { label: 'Returning share', value: pct(g.returningPct) },
        {
          label: 'Stays',
          value: String(list.reduce((s, x) => s + x.stays, 0)),
        },
      ],
      sections: [
        {
          title: 'Guest directory',
          // The cap note, when there is one, is appended to the standing note
          // rather than replacing it - both say something the reader needs.
          note: [
            'Stays, nights and revenue are each guest’s lifetime figures to date, not just this period.',
            guests.note,
          ]
            .filter(Boolean)
            .join(' '),
          columns: [
            { label: 'Guest', width: 2 },
            { label: 'Phone', width: 1.4 },
            { label: 'Stays', align: 'right' },
            { label: 'Nights', align: 'right' },
            { label: 'Revenue before GST', align: 'right', width: 1.6 },
            { label: 'Last stay', width: 1.2 },
          ],
          rows: guests.rows,
          emptyText: 'No guests stayed in this period.',
        },
      ],
    };
  }

  // Overview
  return {
    ...base,
    kpis: [
      {
        label: 'Revenue before GST',
        value: inr(o.revenue),
        sub: `${o.stays} stays`,
      },
      {
        label: 'Occupancy rate',
        value: pct(o.occupancyPct),
        sub: `${o.bookedNights} of ${o.days} nights booked`,
      },
      {
        label: 'Total expenses',
        value: inr(o.expenses),
        sub: `GST on expenses: ${inr(o.expensesGst)}`,
      },
      { label: 'Net before tax', value: inr(o.net) },
      { label: 'Average daily rate', value: inr(o.averageNightly) },
      { label: 'Revenue per available night', value: inr(o.revenuePerNight) },
      { label: 'GST collected', value: inr(o.gstCollected) },
      { label: 'Events', value: String(o.events) },
    ],
    sections: [
      {
        title: 'Month by month',
        columns: [
          { label: 'Month', width: 1.4 },
          { label: 'Nights booked', align: 'right', width: 1.3 },
          { label: 'Nights available', align: 'right', width: 1.3 },
          { label: 'Occupancy', align: 'right' },
          { label: 'Revenue before GST', align: 'right', width: 1.6 },
          { label: 'Expenses', align: 'right', width: 1.2 },
          { label: 'Net', align: 'right', width: 1.2 },
        ],
        rows: o.months.map((m) => [
          monthLabel(m.month),
          String(m.nights),
          String(m.available),
          pct(m.occupancyPct),
          inr(m.revenue),
          inr(m.expenses),
          inr(m.net),
        ]),
        total: [
          'Total',
          String(o.bookedNights),
          String(o.days),
          pct(o.occupancyPct),
          inr(o.revenue),
          inr(o.expenses),
          inr(o.net),
        ],
        emptyText: 'No stays or expenses in this period.',
      },
      {
        title: 'Expenses by category',
        columns: [
          { label: 'Category', width: 3 },
          { label: 'Amount', align: 'right' },
        ],
        rows: o.expensesByCategory.map((c) => [
          categoryLabel(c.category),
          inr(c.amount),
        ]),
        total: ['Total', inr(o.expenses)],
        emptyText: 'No expenses recorded in this period.',
      },
    ],
  };
}
