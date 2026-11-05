import { describe, expect, it } from 'vitest';

import {
  type BookingMoney,
  type MoneyAdjustment,
  adjustmentsAvailable,
  balanceDue,
  basisIsReproducible,
  checkAdjustment,
  describeMoneyChange,
  recomputeMoney,
  taxableValue,
} from './booking-adjust';

// A real Villa 19 shape: 2 nights at 23,000 = 46,000 stay, 18% GST = 54,280.
const STAY = 46_000_00;
const NIGHTS = 2;

const adj = (
  basePaise: number,
  extraGuestPaise = 0,
  discountPaise = 0,
): MoneyAdjustment => ({ basePaise, extraGuestPaise, discountPaise });

describe('taxableValue', () => {
  it('takes the discount off before GST', () => {
    expect(taxableValue(adj(STAY, 300_000, 500_000))).toBe(
      STAY + 300_000 - 500_000,
    );
  });
});

describe('recomputeMoney', () => {
  it('reproduces the quoted total for an unchanged stay', () => {
    const money = recomputeMoney(adj(STAY), NIGHTS);

    expect(money.taxPaise).toBe(Math.round((STAY * 18) / 100));
    expect(money.totalPaise).toBe(54_280_00);
  });

  it('taxes the extra-guest charge too', () => {
    const money = recomputeMoney(adj(STAY, 300_000), NIGHTS);

    expect(money.taxPaise).toBe(Math.round(((STAY + 300_000) * 18) / 100));
    expect(money.totalPaise).toBe(STAY + 300_000 + money.taxPaise);
  });

  it('lowers the GST with a discount, not just the total', () => {
    const plain = recomputeMoney(adj(STAY), NIGHTS);
    const discounted = recomputeMoney(adj(STAY, 0, 500_000), NIGHTS);

    expect(discounted.taxPaise).toBeLessThan(plain.taxPaise);
    expect(discounted.totalPaise).toBe(STAY - 500_000 + discounted.taxPaise);
  });

  it('rounds the tax to whole paise', () => {
    const money = recomputeMoney(adj(99_999), 1);

    expect(Number.isInteger(money.taxPaise)).toBe(true);
    expect(money.taxPaise).toBe(Math.round((99_999 * 18) / 100));
  });

  it('handles a fully discounted stay', () => {
    const money = recomputeMoney(adj(STAY, 0, STAY), NIGHTS);

    expect(money.taxPaise).toBe(0);
    expect(money.totalPaise).toBe(0);
  });
});

describe('checkAdjustment', () => {
  it('allows an increase above what was received', () => {
    expect(
      checkAdjustment({
        next: adj(STAY, 300_000),
        receivedPaise: 10_000_00,
        nights: NIGHTS,
      }),
    ).toBeNull();
  });

  it('allows a reduction that still covers the receipts', () => {
    expect(
      checkAdjustment({
        next: adj(STAY, 0, 500_000),
        receivedPaise: 10_000_00,
        nights: NIGHTS,
      }),
    ).toBeNull();
  });

  // The guard that matters: this must not become a silent back door to a
  // refund. Refunding is its own action with its own record.
  it('refuses a total below the money already received', () => {
    const refusal = checkAdjustment({
      next: adj(20_000_00),
      receivedPaise: 54_280_00,
      nights: NIGHTS,
    });

    expect(refusal?.code).toBe('BELOW_RECEIPTS');
    expect(refusal?.message).toContain('Record the refund first');
    expect(refusal?.message).toContain('₹54,280');
  });

  it('allows a total exactly equal to the receipts', () => {
    expect(
      checkAdjustment({
        next: adj(46_000_00),
        receivedPaise: 54_280_00,
        nights: NIGHTS,
      }),
    ).toBeNull();
  });

  it('refuses a discount larger than the stay', () => {
    expect(
      checkAdjustment({
        next: adj(STAY, 0, STAY + 1),
        receivedPaise: 0,
        nights: NIGHTS,
      })?.code,
    ).toBe('DISCOUNT_TOO_LARGE');
  });

  it('allows a fully comped stay when nothing was received', () => {
    expect(
      checkAdjustment({
        next: adj(STAY, 0, STAY),
        receivedPaise: 0,
        nights: NIGHTS,
      }),
    ).toBeNull();
  });
});

describe('basisIsReproducible', () => {
  it('is true for a stay whose tax follows its own figures', () => {
    expect(basisIsReproducible(recomputeMoney(adj(STAY), NIGHTS), NIGHTS)).toBe(
      true,
    );
  });

  // A row priced under the per-night slab, a legacy import, or something
  // entered by hand. Recomputing would restate its tax on a save with no
  // edits at all, logged against an operator who changed nothing.
  it('is false when the stored tax does not follow', () => {
    const money = recomputeMoney(adj(STAY), NIGHTS);

    expect(
      basisIsReproducible({ ...money, taxPaise: money.taxPaise - 100 }, NIGHTS),
    ).toBe(false);

    expect(
      basisIsReproducible(
        { ...money, totalPaise: money.totalPaise + 100 },
        NIGHTS,
      ),
    ).toBe(false);
  });

  it('is false under the per-night slab, which it cannot reproduce', () => {
    expect(
      basisIsReproducible(
        recomputeMoney(adj(STAY), NIGHTS),
        NIGHTS,
        'per_night_slab',
      ),
    ).toBe(false);
  });
});

describe('adjustmentsAvailable', () => {
  it('is the switch both the UI gate and the service read', () => {
    expect(adjustmentsAvailable('site_flat_18')).toBe(true);
    expect(adjustmentsAvailable('per_night_slab')).toBe(false);
  });
});

describe('balanceDue', () => {
  it('is what is still owed, and never negative', () => {
    const money = recomputeMoney(adj(STAY), NIGHTS);

    expect(balanceDue(money, 10_000_00)).toBe(54_280_00 - 10_000_00);
    expect(balanceDue(money, 54_280_00)).toBe(0);
    expect(balanceDue(money, 60_000_00)).toBe(0);
  });
});

describe('describeMoneyChange', () => {
  const before: BookingMoney = recomputeMoney(adj(STAY), NIGHTS);

  it('is empty when nothing moved', () => {
    expect(describeMoneyChange(before, { ...before })).toEqual([]);
  });

  it('names the derived lines too, in rupees', () => {
    const after = recomputeMoney(adj(STAY, 300_000), NIGHTS);

    expect(describeMoneyChange(before, after)).toEqual([
      'Extra guests: ₹0.00 → ₹3,000.00',
      'GST: ₹8,280.00 → ₹8,820.00',
      'Total: ₹54,280.00 → ₹57,820.00',
    ]);
  });

  // Rounding to whole rupees logged a real adjustment as "₹1,000 → ₹1,000"
  // while the toast claimed the change was recorded - in the entry whose
  // stated purpose is being read with a tax return open.
  it('keeps the paise, which is the whole point of the format', () => {
    const from = recomputeMoney(adj(1_000_00), 1);
    const to = recomputeMoney(adj(1_000_49), 1);

    expect(describeMoneyChange(from, to)).toContain(
      'Stay charge: ₹1,000.00 → ₹1,000.49',
    );
  });

  it('records a discount being applied', () => {
    const after = recomputeMoney(adj(STAY, 0, 500_000), NIGHTS);
    const lines = describeMoneyChange(before, after);

    expect(lines[0]).toBe('Discount: ₹0.00 → ₹5,000.00');
    expect(lines.some((l) => l.startsWith('Total:'))).toBe(true);
  });
});
