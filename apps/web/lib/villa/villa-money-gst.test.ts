import { describe, expect, it } from 'vitest';

import {
  GST_LOWER_SLAB_CEILING_PAISE,
  computeStayGst,
  gstRateForNight,
  splitCgstSgst,
} from './gst';
import { fromPaise, fromPaiseToString, toPaise } from './money';

describe('toPaise / fromPaise', () => {
  it('converts exactly, without float error', () => {
    expect(toPaise('14500.00')).toBe(1_450_000);
    expect(toPaise('0.29')).toBe(29); // 0.29 * 100 is 28.999999999999996
    expect(toPaise(0.29)).toBe(29);
    expect(toPaise('1000.5')).toBe(100_050);
    expect(toPaise(7500)).toBe(750_000);
    expect(toPaise('-12.34')).toBe(-1234);
  });

  it('rejects anything that is not an exact rupee amount', () => {
    expect(() => toPaise('12.345')).toThrow();
    expect(() => toPaise(0.1 + 0.2)).toThrow();
    expect(() => toPaise('abc')).toThrow();
    expect(() => toPaise(Number.NaN)).toThrow();
    expect(() => toPaise('')).toThrow();
  });

  it('round-trips', () => {
    for (const rupees of ['0.00', '0.01', '14500.50', '999999999.99']) {
      expect(fromPaiseToString(toPaise(rupees))).toBe(rupees);
    }
    expect(fromPaise(1_450_050)).toBe(14500.5);
    expect(fromPaiseToString(-5)).toBe('-0.05');
  });

  it('rejects fractional paise', () => {
    expect(() => fromPaise(10.5)).toThrow();
  });
});

describe('gstRateForNight', () => {
  it('is 5% up to and including ₹7,500, 18% above', () => {
    expect(gstRateForNight(GST_LOWER_SLAB_CEILING_PAISE)).toBe(5);
    expect(gstRateForNight(GST_LOWER_SLAB_CEILING_PAISE + 1)).toBe(18);
    expect(gstRateForNight(300_000)).toBe(5);
    expect(gstRateForNight(1_450_000)).toBe(18);
  });
});

describe('splitCgstSgst', () => {
  it('always sums to the tax, odd paisa to SGST', () => {
    expect(splitCgstSgst(261_000)).toEqual({
      cgstPaise: 130_500,
      sgstPaise: 130_500,
    });
    expect(splitCgstSgst(101)).toEqual({ cgstPaise: 50, sgstPaise: 51 });
  });
});

describe('computeStayGst', () => {
  it('Villa 19 weekday night: 18% on ₹14,500', () => {
    const gst = computeStayGst([{ date: '2026-10-12', ratePaise: 1_450_000 }]);

    expect(gst.taxPaise).toBe(261_000); // ₹2,610
    expect(gst.cgstPaise).toBe(130_500);
    expect(gst.sgstPaise).toBe(130_500);
    expect(gst.totalPaise).toBe(1_711_000);
    expect(gst.lines).toHaveLength(1);
  });

  it('stays at 18% under the maximum 25% discount (₹10,875 > ₹7,500)', () => {
    const gst = computeStayGst([
      { date: '2026-10-12', ratePaise: 1_450_000, discountPaise: 362_500 },
    ]);

    expect(gst.nights[0]!.taxablePaise).toBe(1_087_500);
    expect(gst.nights[0]!.rate).toBe(18);
  });

  it('extras count toward the slab: ₹7,000 + ₹1,000 extra bed is 18%', () => {
    const gst = computeStayGst([
      { date: '2026-10-12', ratePaise: 700_000, extrasPaise: 100_000 },
    ]);

    expect(gst.nights[0]!.rate).toBe(18);
  });

  it('a discount can move a night into the lower slab', () => {
    const gst = computeStayGst([
      { date: '2026-10-12', ratePaise: 800_000, discountPaise: 50_000 },
    ]);

    expect(gst.nights[0]!.taxablePaise).toBe(750_000);
    expect(gst.nights[0]!.rate).toBe(5);
    expect(gst.taxPaise).toBe(37_500);
  });

  it('taxes a stay that straddles slabs night by night, one line per rate', () => {
    const gst = computeStayGst([
      { date: '2026-10-12', ratePaise: 700_000 }, // 5%  → 35,000
      { date: '2026-10-13', ratePaise: 900_000 }, // 18% → 162,000
      { date: '2026-10-14', ratePaise: 700_000 }, // 5%  → 35,000
    ]);

    expect(
      gst.lines.map((l) => [l.rate, l.nights, l.taxablePaise, l.taxPaise]),
    ).toEqual([
      [5, 2, 1_400_000, 70_000],
      [18, 1, 900_000, 162_000],
    ]);
    expect(gst.taxPaise).toBe(232_000);
    expect(gst.cgstPaise + gst.sgstPaise).toBe(gst.taxPaise);
    expect(gst.totalPaise).toBe(2_300_000 + 232_000);
  });

  it('rounds half up per night, in paise', () => {
    // 5% of ₹100.10 = ₹5.005 → ₹5.01
    const gst = computeStayGst([{ date: '2026-10-12', ratePaise: 10_010 }]);
    expect(gst.taxPaise).toBe(501);
  });

  it('rejects bad input instead of producing a wrong invoice', () => {
    expect(() => computeStayGst([{ date: 'x', ratePaise: 100.5 }])).toThrow();
    expect(() => computeStayGst([{ date: 'x', ratePaise: -1 }])).toThrow();
    expect(() =>
      computeStayGst([{ date: 'x', ratePaise: 100, discountPaise: 200 }]),
    ).toThrow();
  });
});
