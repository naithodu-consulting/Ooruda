import { describe, expect, it } from 'vitest';

import { monthKpis, todayBoard } from './kpis';

const stay = (over: Partial<Parameters<typeof monthKpis>[1][0]> = {}) => ({
  status: 'confirmed',
  check_in: '2026-10-10',
  check_out: '2026-10-12',
  nights: 2,
  base_amount: 20000,
  extra_guest_amount: 2000,
  discount_amount: 0,
  ...over,
});

describe('monthKpis', () => {
  it('counts nights, revenue before GST, ADR and RevPAR', () => {
    const k = monthKpis('2026-10', [stay()]);
    expect(k).toEqual({
      nightsInMonth: 31,
      bookedNights: 2,
      occupancyPct: 6.5,
      revenue: 22000,
      averageNightly: 11000,
      revenuePerNight: 709.68,
      stays: 1,
    });
  });

  it('splits a stay crossing the month end pro rata', () => {
    const k = monthKpis('2026-10', [
      stay({
        check_in: '2026-10-30',
        check_out: '2026-11-03',
        nights: 4,
        base_amount: 40000,
        extra_guest_amount: 0,
      }),
    ]);
    expect(k.bookedNights).toBe(2);
    expect(k.revenue).toBe(20000);
  });

  it('ignores holds, cancellations and other months', () => {
    const k = monthKpis('2026-10', [
      stay({ status: 'pending' }),
      stay({ status: 'cancelled' }),
      stay({ status: 'expired' }),
      stay({ check_in: '2026-11-01', check_out: '2026-11-02', nights: 1 }),
    ]);
    expect(k.bookedNights).toBe(0);
    expect(k.revenue).toBe(0);
    expect(k.averageNightly).toBe(0);
  });

  it('counts checked-out stays', () => {
    expect(monthKpis('2026-10', [stay({ status: 'completed' })]).stays).toBe(1);
  });
});

describe('todayBoard', () => {
  const b = (
    id: string,
    checkIn: string,
    checkOut: string,
    status = 'confirmed',
  ) => ({
    id,
    status,
    guestName: id,
    checkIn,
    checkOut,
  });

  it('sorts arrivals, departures and guests staying', () => {
    const board = todayBoard(
      [
        b('arrive', '2026-10-10', '2026-10-12'),
        b('leave', '2026-10-08', '2026-10-10'),
        b('stay', '2026-10-09', '2026-10-11'),
        b('gone', '2026-10-08', '2026-10-10', 'completed'),
        b('held', '2026-10-10', '2026-10-11', 'pending'),
      ],
      '2026-10-10',
    );
    expect(board.arrivals.map((x) => x.id)).toEqual(['arrive']);
    expect(board.departures.map((x) => x.id)).toEqual(['leave']);
    expect(board.inHouse.map((x) => x.id)).toEqual(['arrive', 'stay']);
  });

  it('distinguishes arriving vs checked-in guests when checkedInIds is provided', () => {
    const board = todayBoard(
      [
        b('pending-arrive', '2026-10-10', '2026-10-12'),
        b('already-checked-in', '2026-10-10', '2026-10-12'),
        b('staying-checked-in', '2026-10-09', '2026-10-11'),
        b('leave', '2026-10-08', '2026-10-10'),
      ],
      '2026-10-10',
      new Set(['already-checked-in', 'staying-checked-in']),
    );
    expect(board.arrivals.map((x) => x.id)).toEqual(['pending-arrive']);
    expect(board.checkedIn.map((x) => x.id)).toEqual([
      'already-checked-in',
      'staying-checked-in',
    ]);
    expect(board.departures.map((x) => x.id)).toEqual(['leave']);
  });
});
