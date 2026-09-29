import { describe, expect, it } from 'vitest';

import {
  blockNoteForDisplay,
  buildAgenda,
  gridRange,
  buildMonth,
  monthOccupancy,
  parseMonth,
  shiftMonth,
} from './calendar';

const booking = (over: Partial<Parameters<typeof buildMonth>[1][0]> = {}) => ({
  id: 'b1',
  bookingCode: 'UV-2610-ABC',
  guestName: 'Asha',
  status: 'confirmed',
  checkIn: '2026-10-10',
  checkOut: '2026-10-12',
  ...over,
});

describe('month helpers', () => {
  it('parses a valid month and falls back to today', () => {
    expect(parseMonth('2026-10', '2026-09-30')).toBe('2026-10');
    expect(parseMonth('2026-13', '2026-09-30')).toBe('2026-09');
    expect(parseMonth(undefined, '2026-09-30')).toBe('2026-09');
    expect(parseMonth('junk', '2026-09-30')).toBe('2026-09');
  });

  it('shifts across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('buildMonth', () => {
  const weeks = buildMonth('2026-10', [booking()], [], '2026-10-11');
  const days = weeks.flat();
  const day = (d: string) => days.find((x) => x.date === d)!;

  it('covers whole Monday-first weeks', () => {
    expect(days[0]!.date).toBe('2026-09-28'); // Monday
    expect(days.length % 7).toBe(0);
    expect(days.at(-1)!.date).toBe('2026-11-01'); // Sunday
    expect(day('2026-09-28').inMonth).toBe(false);
  });

  it('occupies nights, never the check-out day', () => {
    expect(day('2026-10-10').items).toHaveLength(1);
    expect(day('2026-10-11').items).toHaveLength(1);
    expect(day('2026-10-12').items).toHaveLength(0);
    expect(day('2026-10-10').items[0]).toMatchObject({
      starts: true,
      ends: false,
    });
    expect(day('2026-10-11').items[0]).toMatchObject({
      starts: false,
      ends: true,
    });
  });

  it('marks today and the past', () => {
    expect(day('2026-10-11').isToday).toBe(true);
    expect(day('2026-10-10').isPast).toBe(true);
  });

  it('hides cancelled bookings and shows holds as held', () => {
    const w = buildMonth(
      '2026-10',
      [
        booking({ status: 'cancelled' }),
        booking({
          id: 'b2',
          status: 'pending',
          checkIn: '2026-10-20',
          checkOut: '2026-10-21',
        }),
      ],
      [],
      '2026-10-01',
    ).flat();
    expect(w.find((x) => x.date === '2026-10-10')!.items).toHaveLength(0);
    expect(w.find((x) => x.date === '2026-10-20')!.items[0]).toMatchObject({
      held: true,
    });
  });

  it('shows blocks', () => {
    const w = buildMonth(
      '2026-10',
      [],
      [
        {
          id: 'k1',
          startDate: '2026-10-30',
          endDate: '2026-11-02',
          reason: 'maintenance',
        },
      ],
      '2026-10-01',
    ).flat();
    expect(w.find((x) => x.date === '2026-10-31')!.items[0]).toMatchObject({
      kind: 'block',
    });
    expect(w.find((x) => x.date === '2026-11-01')!.items).toHaveLength(1);
  });
});

describe('buildAgenda', () => {
  it('clips to the month and sorts by first night', () => {
    const agenda = buildAgenda(
      '2026-10',
      [
        booking({ checkIn: '2026-09-29', checkOut: '2026-10-03' }),
        booking({ id: 'b2', checkIn: '2026-10-20', checkOut: '2026-10-22' }),
      ],
      [
        {
          id: 'k1',
          startDate: '2026-10-05',
          endDate: '2026-10-06',
          reason: null,
        },
      ],
    );
    expect(agenda.map((a) => a.id)).toEqual(['b1', 'k1', 'b2']);
    expect(agenda[0]).toMatchObject({
      from: '2026-10-01',
      lastNight: '2026-10-02',
    });
    expect(agenda[1]).toMatchObject({
      from: '2026-10-05',
      lastNight: '2026-10-05',
    });
  });
});

describe('monthOccupancy', () => {
  it('counts booked and blocked nights once each', () => {
    expect(
      monthOccupancy(
        '2026-02',
        [booking({ checkIn: '2026-02-01', checkOut: '2026-02-04' })],
        [
          {
            id: 'k',
            startDate: '2026-02-03',
            endDate: '2026-02-06',
            reason: null,
          },
        ],
      ),
    ).toEqual({ booked: 3, blocked: 2, nights: 28 });
  });
});

describe('gridRange and notes', () => {
  it('spans whole weeks', () => {
    expect(gridRange('2026-10')).toEqual({
      from: '2026-09-28',
      to: '2026-11-02',
    });
  });

  it('hides the trace marker', () => {
    expect(
      blockNoteForDisplay(
        'Pool work [ooruda:0f8b1c2e-1111-4a2b-9c3d-123456789abc]',
      ),
    ).toBe('Pool work');
    expect(
      blockNoteForDisplay('[ooruda:0f8b1c2e-1111-4a2b-9c3d-123456789abc]'),
    ).toBeNull();
    expect(blockNoteForDisplay(null)).toBeNull();
  });
});
