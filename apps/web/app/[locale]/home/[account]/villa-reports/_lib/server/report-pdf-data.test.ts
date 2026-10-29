import { describe, expect, it } from 'vitest';

import {
  type ReportExpense,
  type ReportStay,
  buildChannels,
  buildGstReport,
  buildGuests,
  buildOverview,
  buildPaymentsReport,
  resolveReportRange,
} from '~/lib/villa/reports';

import type { VillaReportData } from './load-report';
import { buildPdfData } from './report-pdf-data';

const range = resolveReportRange(
  { preset: 'custom', from: '2026-04-01', to: '2027-03-31' },
  '2026-10-29',
);

const stay = (over: Partial<ReportStay>): ReportStay =>
  ({
    status: 'confirmed',
    booking_kind: 'stay',
    channel: 'online',
    check_in: '2026-05-10',
    check_out: '2026-05-12',
    nights: 2,
    base_amount: 3_000_000,
    extra_guest_amount: 0,
    discount_amount: 0,
    tax_amount: 540_000,
    guest_name: 'Asha Rao',
    guest_phone: '+919845000000',
    booking_code: 'V19-001-ABC',
    ...over,
  }) as ReportStay;

const expense = (over: Partial<ReportExpense>): ReportExpense => ({
  spent_on: '2026-05-04',
  category: 'housekeeping',
  amount: 50_000,
  gst_amount: 9_000,
  description: 'Deep clean',
  vendor: 'Sparkle',
  mode: 'cash',
  invoice_no: 'INV-1',
  ...over,
});

function dataFor(
  stays: ReportStay[],
  expenses: ReportExpense[],
): VillaReportData {
  return {
    overview: buildOverview(range, stays, expenses),
    expenses,
    payments: buildPaymentsReport(
      range,
      [
        {
          id: 'p1',
          paid_on: '2026-05-10',
          mode: 'upi',
          amount: 20_000,
          reference: 'REF1',
          payer_name: 'Asha Rao',
          booking_code: 'V19-001-ABC',
        },
      ],
      [
        {
          id: 'r1',
          refunded_on: '2026-06-01',
          mode: 'bank',
          amount: 5_000,
          reason: 'Cancelled in the refundable window',
        },
      ],
    ),
    gst: buildGstReport(range, stays, expenses),
    channels: buildChannels(range, stays),
    guests: buildGuests(range, stays, 1000),
  };
}

describe('buildPdfData', () => {
  const data = dataFor(
    [
      stay({}),
      stay({
        channel: 'phone',
        check_in: '2026-06-10',
        check_out: '2026-06-12',
      }),
    ],
    [expense({}), expense({ category: 'repairs', amount: 30_000 })],
  );

  it('titles the document after the tab and the period', () => {
    const pdf = buildPdfData('gst_summary', range, 'Villa 19', 'Pradeep', data);

    expect(pdf.title).toBe('GST Summary');
    expect(pdf.periodLabel).toContain('2026');
    expect(pdf.villaName).toBe('Villa 19');
    expect(pdf.generatedBy).toBe('Pradeep');
  });

  it('gives every row the same number of cells as the header', () => {
    for (const tab of [
      'overview',
      'expenses',
      'payments',
      'gst_summary',
      'channels',
      'guests',
    ] as const) {
      const pdf = buildPdfData(tab, range, 'Villa 19', 'Pradeep', data);

      for (const section of pdf.sections) {
        const width = section.columns.length;

        for (const row of section.rows) {
          expect(
            { tab, section: section.title, cells: row.length },
            `row width in ${tab} / ${section.title}`,
          ).toEqual({ tab, section: section.title, cells: width });
        }

        if (section.total) {
          expect(section.total.length).toBe(width);
        }
      }
    }
  });

  it('totals the expense table to the same figure as its KPI tile', () => {
    const pdf = buildPdfData('expenses', range, 'Villa 19', 'Pradeep', data);
    const tile = pdf.kpis.find((k) => k.label === 'Total expenses');
    const all = pdf.sections.find((s) => s.title === 'All expenses');

    // villa_expenses stores rupees, not paise.
    expect(tile?.value).toBe('₹80,000');
    expect(all?.total?.at(-2)).toBe('₹80,000');
  });

  it('prints channels, modes and categories by their labels, not their codes', () => {
    const channels = buildPdfData('channels', range, 'V', 'P', data);
    const expenses = buildPdfData('expenses', range, 'V', 'P', data);
    const payments = buildPdfData('payments', range, 'V', 'P', data);

    expect(channels.sections[0]?.rows.map((r) => r[0])).toEqual(
      expect.arrayContaining(['Website', 'Phone']),
    );
    expect(expenses.sections[0]?.rows.map((r) => r[0])).toEqual(
      expect.arrayContaining(['Housekeeping', 'Repairs and maintenance']),
    );
    expect(payments.sections[1]?.rows[0]?.[3]).toBe('UPI');
  });

  it('says so rather than printing an empty table when a period has nothing', () => {
    const empty = buildPdfData(
      'expenses',
      range,
      'Villa 19',
      'Pradeep',
      dataFor([], []),
    );
    const all = empty.sections.find((s) => s.title === 'All expenses');

    expect(all?.rows).toHaveLength(0);
    expect(all?.emptyText).toBe('No expenses recorded in this period.');
  });

  it('falls back to the overview for an unknown tab', () => {
    const pdf = buildPdfData(
      'nonsense' as never,
      range,
      'Villa 19',
      'Pradeep',
      data,
    );

    expect(pdf.title).toBe('Revenue & Occupancy');
  });
});
