import { describe, expect, it } from 'vitest';

import {
  type PricingRule,
  coalesceNights,
  groupPricingRules,
  validateBaseRates,
} from './rates';

// Villa 19 today (villa-booking 00039): 8 included, 14 max, guests 9-11 at
// ₹1,000 and 12-14 at ₹700 per night.
const villa19 = {
  weekdayNightly: '12000',
  weekendNightly: '14000.00',
  extraGuestRate: '1000',
  extraGuestTier2Rate: '700',
  extraGuestTier2From: 12,
  includedGuests: 8,
  maxGuests: 14,
  idealGuests: 8,
  checkInTime: '14:00',
  checkOutTime: '11:00',
};

describe('validateBaseRates', () => {
  it('accepts Villa 19 and converts to the site row in paise', () => {
    expect(validateBaseRates(villa19)).toEqual({
      base_nightly_rate: 1_200_000,
      weekend_nightly_rate: 1_400_000,
      extra_guest_rate: 100_000,
      extra_guest_tier2_rate: 70_000,
      extra_guest_tier2_from: 12,
      base_occupancy: 8,
      max_occupancy: 14,
      ideal_occupancy: 8,
      check_in_time: '14:00:00',
      check_out_time: '11:00:00',
    });
  });

  it('accepts a single extra-guest rate (no second tier)', () => {
    const row = validateBaseRates({
      ...villa19,
      extraGuestTier2Rate: null,
      extraGuestTier2From: null,
    });

    expect(row.extra_guest_tier2_rate).toBeNull();
    expect(row.extra_guest_tier2_from).toBeNull();
  });

  it('needs both second-tier fields or neither (site constraint)', () => {
    expect(() =>
      validateBaseRates({ ...villa19, extraGuestTier2From: null }),
    ).toThrow(/both/);
    expect(() =>
      validateBaseRates({ ...villa19, extraGuestTier2Rate: null }),
    ).toThrow(/both/);
  });

  it('starts the second tier after guest included+1 (site constraint)', () => {
    // included 8 → the tier must start at guest 10 or later
    expect(() =>
      validateBaseRates({ ...villa19, extraGuestTier2From: 9 }),
    ).toThrow(/second tier must start after guest 9/);
    expect(
      validateBaseRates({ ...villa19, extraGuestTier2From: 10 })
        .extra_guest_tier2_from,
    ).toBe(10);
    expect(() =>
      validateBaseRates({ ...villa19, extraGuestTier2From: 15 }),
    ).toThrow();
  });

  it('refuses zero or malformed rates, and bad guest counts', () => {
    expect(() =>
      validateBaseRates({ ...villa19, weekdayNightly: '0' }),
    ).toThrow(/more than zero/);
    expect(() =>
      validateBaseRates({ ...villa19, weekendNightly: '12.345' }),
    ).toThrow();
    expect(() =>
      validateBaseRates({ ...villa19, extraGuestRate: '-5' }),
    ).toThrow();
    expect(() => validateBaseRates({ ...villa19, maxGuests: 6 })).toThrow(
      /at least/,
    );
    expect(() =>
      validateBaseRates({ ...villa19, includedGuests: 0 }),
    ).toThrow();
  });

  it('keeps "Ideal for" within the maximum (site copy and default guest count)', () => {
    expect(() =>
      validateBaseRates({
        ...villa19,
        maxGuests: 12,
        idealGuests: 13,
        extraGuestTier2From: 12,
      }),
    ).toThrow(/Ideal for/);
    expect(
      validateBaseRates({ ...villa19, idealGuests: 14 }).ideal_occupancy,
    ).toBe(14);
  });

  it('refuses times not in HH:MM', () => {
    expect(() => validateBaseRates({ ...villa19, checkInTime: '2pm' })).toThrow(
      /HH:MM/,
    );
    expect(() =>
      validateBaseRates({ ...villa19, checkOutTime: '24:00' }),
    ).toThrow();
  });
});

describe('coalesceNights', () => {
  it('turns one night into one half-open range', () => {
    expect(coalesceNights(['2026-12-20'])).toEqual([
      { startDate: '2026-12-20', endDate: '2026-12-21' },
    ]);
  });

  it('joins consecutive nights into a single range', () => {
    expect(coalesceNights(['2026-12-20', '2026-12-21', '2026-12-22'])).toEqual([
      { startDate: '2026-12-20', endDate: '2026-12-23' },
    ]);
  });

  it('keeps a gap as a separate range', () => {
    // 20-22 December plus Christmas Day: one rate, two rows.
    expect(
      coalesceNights(['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-25']),
    ).toEqual([
      { startDate: '2026-12-20', endDate: '2026-12-23' },
      { startDate: '2026-12-25', endDate: '2026-12-26' },
    ]);
  });

  it('does not care about order or duplicates', () => {
    expect(
      coalesceNights(['2026-12-22', '2026-12-20', '2026-12-21', '2026-12-20']),
    ).toEqual([{ startDate: '2026-12-20', endDate: '2026-12-23' }]);
  });

  it('spans a month boundary', () => {
    expect(coalesceNights(['2026-12-31', '2027-01-01'])).toEqual([
      { startDate: '2026-12-31', endDate: '2027-01-02' },
    ]);
  });

  it('is empty for no nights', () => {
    expect(coalesceNights([])).toEqual([]);
  });
});

function rule(
  id: string,
  name: string,
  startDate: string,
  endDate: string,
  nightlyRate = 18000,
  minStayNights = 1,
): PricingRule {
  return { id, name, startDate, endDate, nightlyRate, minStayNights };
}

describe('groupPricingRules', () => {
  it('gathers the rows of one named rate into a single group', () => {
    const groups = groupPricingRules([
      rule('a', 'Christmas', '2026-12-20', '2026-12-23'),
      rule('b', 'Christmas', '2026-12-25', '2026-12-26'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('Christmas');
    expect(groups[0]!.nights).toEqual([
      '2026-12-20',
      '2026-12-21',
      '2026-12-22',
      '2026-12-25',
    ]);
    expect(groups[0]!.ranges.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps same-named rows at different prices apart', () => {
    // Legacy rows the old form could create. Merging them would silently
    // reprice one of the two.
    const groups = groupPricingRules([
      rule('a', 'Peak', '2026-12-20', '2026-12-21', 18000),
      rule('b', 'Peak', '2026-12-25', '2026-12-26', 22000),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.nightlyRate)).toEqual([18000, 22000]);
  });

  it('orders groups by their first night', () => {
    const groups = groupPricingRules([
      rule('b', 'New Year', '2026-12-31', '2027-01-01'),
      rule('a', 'Diwali', '2026-11-01', '2026-11-03'),
    ]);

    expect(groups.map((g) => g.name)).toEqual(['Diwali', 'New Year']);
  });

  it('is empty when there are no rules', () => {
    expect(groupPricingRules([])).toEqual([]);
  });
});
