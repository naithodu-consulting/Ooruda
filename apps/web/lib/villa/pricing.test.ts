import { describe, expect, it } from 'vitest';

import {
  type PricingProperty,
  type PricingRuleInput,
  quoteStay,
} from './pricing';

import { existsSync } from 'node:fs';

// Villa 19 today (villa-booking 00039/00040): ₹12,000 weekdays, ₹14,000
// Fri/Sat, 8 included, max 14, guests 9–11 at ₹1,000 and 12–14 at ₹700.
const villa19: PricingProperty = {
  base_nightly_rate: 1_200_000,
  weekend_nightly_rate: 1_400_000,
  base_occupancy: 8,
  max_occupancy: 14,
  extra_guest_rate: 100_000,
  extra_guest_tier2_rate: 70_000,
  extra_guest_tier2_from: 12,
};

const newYear: PricingRuleInput = {
  rule_name: "New Year's Eve and New Year's Day",
  start_date: '2026-12-31',
  end_date: '2027-01-02',
  nightly_rate: 1_600_000,
  min_stay_nights: 1,
};

function quote(
  checkIn: string,
  checkOut: string,
  adults: number,
  children = 0,
  rules: PricingRuleInput[] = [],
) {
  return quoteStay({
    property: villa19,
    rules,
    checkIn,
    checkOut,
    adults,
    children,
  });
}

describe('quoteStay', () => {
  it('prices weekday and weekend nights (Thu, Fri, Sat → Sun)', () => {
    // 2026-10-15 is a Thursday.
    const r = quote('2026-10-15', '2026-10-18', 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(
      r.quote.nights.map((n) => [n.date, n.ratePaise, n.isWeekend]),
    ).toEqual([
      ['2026-10-15', 1_200_000, false],
      ['2026-10-16', 1_400_000, true],
      ['2026-10-17', 1_400_000, true],
    ]);
    expect(r.quote.basePaise).toBe(4_000_000);
    expect(r.quote.extraGuestPaise).toBe(0);
    expect(r.quote.taxPaise).toBe(720_000); // 18%
    expect(r.quote.totalPaise).toBe(4_720_000);
  });

  it('charges both extra-guest tiers (13 guests: 9–11 at ₹1,000, 12–13 at ₹700)', () => {
    const r = quote('2026-10-19', '2026-10-21', 10, 3); // Mon, Tue
    if (!r.ok) throw new Error(r.error.message);

    expect(r.quote.extraGuests).toBe(5);
    // per night: 3 × 1,000 + 2 × 700 = ₹4,400 → 2 nights
    expect(r.quote.extraGuestPaise).toBe(880_000);
  });

  it('uses a seasonal rule for the nights it covers', () => {
    const r = quote('2026-12-30', '2027-01-02', 4, 0, [newYear]);
    if (!r.ok) throw new Error(r.error.message);

    expect(
      r.quote.nights.map((n) => [n.date, n.ratePaise, n.rule ?? null]),
    ).toEqual([
      ['2026-12-30', 1_200_000, null],
      ['2026-12-31', 1_600_000, newYear.rule_name],
      ['2027-01-01', 1_600_000, newYear.rule_name],
    ]);
  });

  it('enforces min stay, max guests and at least one adult', () => {
    const r1 = quote('2026-12-31', '2027-01-01', 4, 0, [
      { ...newYear, min_stay_nights: 2 },
    ]);
    expect(r1.ok ? null : r1.error.code).toBe('MIN_STAY');

    expect(quote('2026-10-19', '2026-10-20', 12, 3).ok).toBe(false); // 15 > 14
    expect(quote('2026-10-19', '2026-10-20', 0, 2).ok).toBe(false);
    expect(quote('2026-10-20', '2026-10-19', 2).ok).toBe(false);
  });

  it('matches the site: a cheap night still pays the flat 18% today', () => {
    const cheap = {
      ...villa19,
      base_nightly_rate: 600_000,
      weekend_nightly_rate: 600_000,
    };
    const r = quoteStay({
      property: cheap,
      rules: [],
      checkIn: '2026-10-19',
      checkOut: '2026-10-20',
      adults: 2,
      children: 0,
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.quote.taxPaise).toBe(108_000); // 18% of ₹6,000, as the site charges
  });

  it('with the per-night slab switched on, a cheap night pays 5%', () => {
    const cheap = {
      ...villa19,
      base_nightly_rate: 600_000,
      weekend_nightly_rate: 600_000,
    };
    const r = quoteStay({
      property: cheap,
      rules: [],
      checkIn: '2026-10-19',
      checkOut: '2026-10-20',
      adults: 2,
      children: 0,
      taxMode: 'per_night_slab',
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.quote.taxPaise).toBe(30_000); // 5% of ₹6,000
  });

  it('rounds tax once over the stay, like the site (not per night)', () => {
    const odd = {
      ...villa19,
      base_nightly_rate: 100_003,
      weekend_nightly_rate: 100_003,
    };
    const r = quoteStay({
      property: odd,
      rules: [],
      checkIn: '2026-10-19',
      checkOut: '2026-10-21',
      adults: 2,
      children: 0,
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.quote.taxPaise).toBe(36_001); // round(200006 × 0.18), not 2 × round(100003 × 0.18)
  });
});

// ── Parity with the guest site's own engine ─────────────────────────────────
const SITE_ENGINE =
  '/Users/prashanthnbhat/projects/villa-booking/src/lib/pricing-engine.ts';

describe.skipIf(!existsSync(SITE_ENGINE))(
  'parity with villa-booking pricing-engine.ts',
  () => {
    const cases: Array<[string, string, number, number, PricingRuleInput[]]> = [
      ['2026-10-15', '2026-10-18', 8, 0, []],
      ['2026-10-19', '2026-10-24', 10, 3, []],
      ['2026-10-16', '2026-10-17', 14, 0, []],
      ['2026-12-29', '2027-01-03', 6, 2, [newYear]],
      // Longest stay the booking site still quotes for: MAX_STAY_NIGHTS is 10,
      // above which it refuses and asks the guest to contact the villa.
      ['2027-02-01', '2027-02-11', 11, 0, []],
    ];

    it.each(cases)(
      '%s → %s, %i adults + %i children',
      async (ci, co, adults, children, rules) => {
        const { calculateBookingPrice } = await import(
          /* @vite-ignore */ SITE_ENGINE
        );

        const site = calculateBookingPrice(
          villa19,
          rules,
          ci,
          co,
          adults,
          children,
        );
        const ours = quoteStay({
          property: villa19,
          rules,
          checkIn: ci,
          checkOut: co,
          adults,
          children,
        });
        if (!ours.ok) throw new Error(ours.error.message);

        expect(ours.quote.basePaise).toBe(site.base_amount);
        expect(ours.quote.extraGuestPaise).toBe(site.extra_guest_amount);
        // Villa 19 is above ₹7,500 every night, so the slab rule gives the site's 18%.
        expect(ours.quote.taxPaise).toBe(site.tax_amount);
        expect(ours.quote.totalPaise).toBe(site.total_amount);
      },
    );
  },
);
