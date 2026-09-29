import { describe, expect, it } from 'vitest';

import { validateBaseRates } from './rates';

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
