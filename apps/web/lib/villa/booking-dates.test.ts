import { describe, expect, it } from 'vitest';

import {
  checkDateMove,
  describeDateMove,
  nightsBetween,
} from './booking-dates';

const base = {
  status: 'confirmed',
  sourceFeedId: null,
  invoiceNumber: null,
  checkIn: '2099-01-10',
  checkOut: '2099-01-11',
  checkedInAt: null,
};

const move = (
  over: Record<string, unknown> = {},
  args: Record<string, unknown> = {},
) =>
  checkDateMove({
    booking: { ...base, ...over },
    checkIn: '2099-01-12',
    checkOut: '2099-01-13',
    cutoff: null,
    ...args,
  });

describe('nightsBetween', () => {
  it('counts nights, not days', () => {
    expect(nightsBetween('2026-11-10', '2026-11-11')).toBe(1);
    expect(nightsBetween('2026-11-10', '2026-11-13')).toBe(3);
  });

  it('is zero for a reversed or equal range', () => {
    expect(nightsBetween('2026-11-11', '2026-11-10')).toBe(-1);
    expect(nightsBetween('2026-11-10', '2026-11-10')).toBe(0);
  });
});

describe('checkDateMove', () => {
  it('allows a plain move', () => {
    expect(move()).toBeNull();
  });

  it('refuses a stay that is not confirmed', () => {
    expect(move({ status: 'cancelled' })?.code).toBe('NOT_EDITABLE');
    expect(move({ status: 'completed' })?.code).toBe('NOT_EDITABLE');
  });

  it('refuses once the guest has checked in', () => {
    expect(move({ checkedInAt: '2099-01-10T10:00:00Z' })?.code).toBe(
      'CHECKED_IN',
    );
  });

  it('refuses a channel-sold stay', () => {
    expect(move({ sourceFeedId: 'feed-1' })?.code).toBe('CHANNEL_SOLD');
  });

  it('refuses an invoiced stay', () => {
    expect(move({ invoiceNumber: 'V19/26-27/INV/000001' })?.code).toBe(
      'ALREADY_INVOICED',
    );
  });

  it('refuses a reversed range', () => {
    expect(
      move({}, { checkIn: '2099-01-13', checkOut: '2099-01-12' })?.code,
    ).toBe('INVALID_RANGE');
  });

  it('refuses the dates it already has', () => {
    expect(
      move({}, { checkIn: '2099-01-10', checkOut: '2099-01-11' })?.code,
    ).toBe('NO_CHANGE');
  });

  it('refuses past the cutoff, and allows it when overridden', () => {
    expect(move({}, { cutoff: '2099-01-11' })?.code).toBe('PAST_CUTOFF');
    expect(move({}, { cutoff: '2099-01-11', ignoreCutoff: true })).toBeNull();
  });

  it('compares the cutoff as a date string, not a Date', () => {
    // '2099-01-12' is not after a cutoff of '2099-01-12'.
    expect(move({}, { cutoff: '2099-01-12' })).toBeNull();
  });

  it('refuses a move into the past', () => {
    expect(
      move({}, { checkIn: '2020-01-01', checkOut: '2020-01-02' })?.code,
    ).toBe('INVALID_RANGE');
  });

  it('checks status before anything else, so the message is the useful one', () => {
    expect(move({ status: 'cancelled', sourceFeedId: 'feed-1' })?.code).toBe(
      'NOT_EDITABLE',
    );
  });
});

describe('describeDateMove', () => {
  it('names both spans and their lengths', () => {
    expect(
      describeDateMove(
        { checkIn: '2026-11-10', checkOut: '2026-11-11' },
        { checkIn: '2026-11-12', checkOut: '2026-11-15' },
      ),
    ).toBe(
      'Dates: 2026-11-10 to 2026-11-11 (1 night) → 2026-11-12 to 2026-11-15 (3 nights)',
    );
  });
});
