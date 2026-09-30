import { describe, expect, it } from 'vitest';

import {
  type ReportStay,
  buildChannels,
  buildGuests,
  buildOverview,
  resolveReportRange,
  toCsv,
} from './reports';

const stay = (over: Partial<ReportStay> = {}): ReportStay => ({
  status: 'confirmed',
  booking_kind: 'stay',
  channel: 'online',
  check_in: '2026-10-10',
  check_out: '2026-10-12',
  nights: 2,
  base_amount: 20000,
  extra_guest_amount: 2000,
  tax_amount: 3960,
  guest_name: 'Asha',
  guest_phone: '+919876543210',
  booking_code: 'V19-AAA-BBB',
  ...over,
});

describe('resolveReportRange', () => {
  const today = '2026-09-30';

  it('resolves presets in India dates', () => {
    expect(resolveReportRange({}, today)).toEqual({
      preset: 'this_month',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(resolveReportRange({ preset: 'last_month' }, today)).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(resolveReportRange({ preset: 'this_fy' }, today)).toMatchObject({
      from: '2026-04-01',
      to: '2027-03-31',
    });
    expect(
      resolveReportRange({ preset: 'this_fy' }, '2027-02-10'),
    ).toMatchObject({ from: '2026-04-01' });
    expect(resolveReportRange({ preset: 'last_fy' }, today)).toMatchObject({
      from: '2025-04-01',
      to: '2026-03-31',
    });
  });

  it('accepts a sensible custom range and rejects the rest', () => {
    expect(
      resolveReportRange(
        { preset: 'custom', from: '2026-01-05', to: '2026-02-10' },
        today,
      ),
    ).toEqual({ preset: 'custom', from: '2026-01-05', to: '2026-02-10' });
    for (const bad of [
      { from: '2026-02-10', to: '2026-01-05' },
      { from: '2026-02-30', to: '2026-03-05' },
      { from: '2020-01-01', to: '2026-01-01' },
      { from: 'x', to: 'y' },
    ]) {
      expect(
        resolveReportRange({ preset: 'custom', ...bad }, today).preset,
      ).toBe('this_month');
    }
  });
});

describe('buildOverview', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };

  it('counts nights, revenue, GST, ADR, RevPAR, expenses and net', () => {
    const o = buildOverview(
      range,
      [stay(), stay({ status: 'cancelled' }), stay({ status: 'pending' })],
      [
        {
          spent_on: '2026-10-05',
          category: 'pool',
          amount: 1180,
          gst_amount: 180,
        },
        {
          spent_on: '2026-11-01',
          category: 'pool',
          amount: 999,
          gst_amount: 0,
        },
      ],
    );
    expect(o).toMatchObject({
      days: 31,
      bookedNights: 2,
      occupancyPct: 6.5,
      revenue: 22000,
      gstCollected: 3960,
      averageNightly: 11000,
      revenuePerNight: 709.68,
      stays: 1,
      expenses: 1180,
      expensesGst: 180,
      net: 20820,
    });
    expect(o.expensesByCategory).toEqual([{ category: 'pool', amount: 1180 }]);
  });

  it('splits a stay across the period edge and across months', () => {
    const o = buildOverview(
      { from: '2026-10-15', to: '2026-11-30' },
      [
        stay({
          check_in: '2026-10-30',
          check_out: '2026-11-03',
          nights: 4,
          base_amount: 40000,
          extra_guest_amount: 0,
          tax_amount: 7200,
        }),
      ],
      [],
    );
    expect(o.bookedNights).toBe(4);
    expect(
      o.months.map((m) => [m.month, m.nights, m.available, m.revenue]),
    ).toEqual([
      ['2026-10', 2, 17, 20000],
      ['2026-11', 2, 30, 20000],
    ]);
  });

  it('counts events', () => {
    expect(
      buildOverview(range, [stay({ booking_kind: 'event' })], []).events,
    ).toBe(1);
  });
});

describe('buildChannels', () => {
  it('splits revenue by channel with shares', () => {
    const lines = buildChannels({ from: '2026-10-01', to: '2026-10-31' }, [
      stay(),
      stay({ channel: 'phone', base_amount: 10000, extra_guest_amount: 0 }),
      stay({ channel: null, status: 'cancelled' }),
    ]);
    expect(lines).toEqual([
      {
        channel: 'online',
        stays: 1,
        nights: 2,
        revenue: 22000,
        sharePct: 68.8,
      },
      { channel: 'phone', stays: 1, nights: 2, revenue: 10000, sharePct: 31.3 },
    ]);
  });
});

describe('buildGuests', () => {
  it('finds returning guests by phone however it is written', () => {
    const history = [
      stay({
        check_in: '2025-01-10',
        check_out: '2025-01-12',
        guest_phone: '9876543210',
      }),
      stay({ guest_phone: '+91 98765 43210' }),
      stay({ guest_name: 'Ravi', guest_phone: '+919000000001' }),
      stay({
        guest_name: 'Old',
        guest_phone: '+919000000002',
        check_in: '2024-01-01',
        check_out: '2024-01-02',
        nights: 1,
      }),
    ];
    const g = buildGuests({ from: '2026-10-01', to: '2026-10-31' }, history);
    expect(g).toMatchObject({ guests: 2, returning: 1, returningPct: 50 });
    expect(g.top[0]).toMatchObject({
      name: 'Asha',
      stays: 2,
      nights: 4,
      lastStay: '2026-10-10',
    });
  });
});

describe('toCsv', () => {
  it('quotes and neutralises formulas', () => {
    expect(
      toCsv([
        ['Name', 'Amount'],
        ['A, B', 10],
        ['=HYPERLINK("x")', -5],
        ['say "hi"', null],
      ]),
    ).toBe(
      'Name,Amount\r\n"A, B",10\r\n"\'=HYPERLINK(""x"")",-5\r\n"say ""hi""",',
    );
  });
});

describe('review fixes', () => {
  it('uses the dates, not a stored night count, to split revenue', () => {
    const o = buildOverview(
      { from: '2026-10-01', to: '2026-10-31' },
      [stay({ nights: 1 })], // dates say 2 nights
      [],
    );
    expect(o.bookedNights).toBe(2);
    expect(o.revenue).toBe(22000);
  });

  it('month lines add up to the total exactly', () => {
    const o = buildOverview(
      { from: '2026-10-01', to: '2026-12-31' },
      [
        stay({
          check_in: '2026-10-31',
          check_out: '2026-11-03',
          nights: 3,
          base_amount: 10000,
          extra_guest_amount: 0,
        }),
      ],
      [],
    );
    const sum = o.months.reduce((s, m) => s + Math.round(m.revenue * 100), 0);
    expect(sum / 100).toBe(o.revenue);
  });

  it('never merges guests by name alone', () => {
    const g = buildGuests({ from: '2026-10-01', to: '2026-10-31' }, [
      stay({
        guest_name: 'Rahul Sharma',
        guest_phone: null,
        booking_code: 'A',
      }),
      stay({ guest_name: 'Rahul Sharma', guest_phone: '', booking_code: 'B' }),
    ]);
    expect(g).toMatchObject({ guests: 2, returning: 0 });
  });

  it('flags a bad custom range', () => {
    expect(
      resolveReportRange(
        { preset: 'custom', from: '2026-02-10', to: '2026-01-05' },
        '2026-09-30',
      ).invalid,
    ).toBe(true);
  });

  it('neutralises formulas after leading spaces', () => {
    expect(toCsv([['  =cmd']])).toBe("'  =cmd");
  });
});
