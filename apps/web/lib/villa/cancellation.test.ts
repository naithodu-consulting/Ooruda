import { describe, expect, it } from 'vitest';

import { cancellationOutlook } from './cancellation';

/**
 * The tiers this asserts are the booking site's, mirrored in cancellation.ts:
 * 100% more than 14 days before check-in, 50% from 7 to 14, nothing under 7.
 * A failure here means the two channels now quote different refunds.
 */
const CHECK_IN = '2026-12-24';
const TOTAL = 10_000_00; // ₹10,000 in paise

const at = (ymd: string, hhmm = '12:00') => `${ymd}T${hhmm}:00+05:30`;

describe('cancellationOutlook', () => {
  it('gives the full ladder to a booking made before every deadline', () => {
    const o = cancellationOutlook(CHECK_IN, TOTAL, at('2026-10-01'));

    expect(o.state).toBe('full');
    // 15 days before 24 Dec is 9 Dec; 7 days before is 17 Dec.
    expect(o.rows.map((r) => r.refundPaise)).toEqual([TOTAL, TOTAL / 2, 0]);
    expect(o.rows[0]?.when).toBe('Until Wed 9 Dec, 11:59 pm');
    expect(o.rows[1]?.when).toBe('10 Dec 12:00 am to 17 Dec 11:59 pm');
    expect(o.rows[2]?.when).toBe('After Thu 17 Dec, 11:59 pm');
    expect(o.lastRefundableAt).toBe('Thu 17 Dec, 11:59 pm');
  });

  it('keeps the 100% tier through the whole of its last day', () => {
    // The deadline is the END of 9 Dec, so 11:59 pm that night still qualifies
    // and the first minute of 10 Dec does not.
    expect(
      cancellationOutlook(CHECK_IN, TOTAL, at('2026-12-09', '23:59')).state,
    ).toBe('full');
    expect(
      cancellationOutlook(CHECK_IN, TOTAL, at('2026-12-10', '00:01')).state,
    ).toBe('partial');
  });

  it('narrows to the 50% tier for a booking made inside the top window', () => {
    const o = cancellationOutlook(CHECK_IN, TOTAL, at('2026-12-12'));

    expect(o.state).toBe('partial');
    expect(o.rows).toHaveLength(2);
    expect(o.rows[0]?.refundPaise).toBe(TOTAL / 2);
    // Never a deadline that passed before they booked.
    expect(o.rows[0]?.when).not.toContain('9 Dec');
  });

  it('keeps the 50% tier through the whole of its last day', () => {
    expect(
      cancellationOutlook(CHECK_IN, TOTAL, at('2026-12-17', '23:59')).state,
    ).toBe('partial');

    const past = cancellationOutlook(
      CHECK_IN,
      TOTAL,
      at('2026-12-18', '00:01'),
    );

    expect(past.state).toBe('none');
    expect(past.rows).toEqual([]);
    expect(past.lastRefundableAt).toBeUndefined();
  });

  it('rounds a half-refund to whole paise', () => {
    const o = cancellationOutlook(CHECK_IN, 999_99, at('2026-10-01'));

    expect(o.rows[1]?.refundPaise).toBe(Math.round(999_99 / 2));
    expect(Number.isInteger(o.rows[1]?.refundPaise)).toBe(true);
  });

  it('refuses to guess from an unparseable booking time', () => {
    expect(cancellationOutlook(CHECK_IN, TOTAL, 'not a date').state).toBe(
      'none',
    );
  });

  /**
   * The charge is a share of the STAY, netted against money actually received.
   * Worked on the real case from the 2026-10-31 report: a 54,280 stay held with
   * a 10,000 advance, which the old arithmetic promised 54,280 back on.
   */
  describe('part-paid stays', () => {
    const STAY = 54_280_00;
    const EARLY = at('2026-10-01');
    // Charge in the 50% tier: half the stay, so an advance under this refunds
    // nothing. 15 days before 24 Dec is 9 Dec; 7 days before is 17 Dec.
    const HALF_CHARGE = STAY / 2;

    it('defaults to paid in full, matching the figures it always printed', () => {
      const omitted = cancellationOutlook(CHECK_IN, STAY, EARLY);
      const explicit = cancellationOutlook(CHECK_IN, STAY, EARLY, STAY);

      expect(omitted).toEqual(explicit);
      expect(omitted.rows.map((r) => r.refundPaise)).toEqual([
        STAY,
        HALF_CHARGE,
        0,
      ]);
    });

    it('never promises back more than was received', () => {
      const advance = 10_000_00;
      const o = cancellationOutlook(CHECK_IN, STAY, EARLY, advance);

      // The whole advance while the charge is nil, then nothing: the 50% tier
      // charges 27,140 against a 10,000 advance.
      expect(o.rows.map((r) => r.refundPaise)).toEqual([advance, 0, 0]);

      for (const row of o.rows) {
        expect(row.refundPaise).toBeLessThanOrEqual(advance);
      }
    });

    it('keeps the row structure a fully paid stay gets', () => {
      const o = cancellationOutlook(CHECK_IN, STAY, EARLY, 10_000_00);
      const full = cancellationOutlook(CHECK_IN, STAY, EARLY);

      expect(o.rows.map((r) => r.when)).toEqual(full.rows.map((r) => r.when));
      expect(o.rows.map((r) => r.amount)).toEqual(
        full.rows.map((r) => r.amount),
      );
    });

    it('refunds the excess once receipts pass the charge', () => {
      const advance = 40_000_00;
      const o = cancellationOutlook(CHECK_IN, STAY, EARLY, advance);

      expect(o.rows.map((r) => r.refundPaise)).toEqual([
        advance,
        advance - HALF_CHARGE,
        0,
      ]);
    });

    it('refunds nothing at the exact charge, and never a negative', () => {
      const o = cancellationOutlook(CHECK_IN, STAY, EARLY, HALF_CHARGE);

      expect(o.rows[1]?.refundPaise).toBe(0);
      for (const row of o.rows)
        expect(row.refundPaise).toBeGreaterThanOrEqual(0);
    });

    it('names the last tier that actually pays, not the last one open', () => {
      // 20,000 is under the 50% charge, so eligibility ends at the 100% tier's
      // deadline (9 Dec) - not 17 Dec, by which nothing would come back.
      const o = cancellationOutlook(CHECK_IN, STAY, EARLY, 20_000_00);

      expect(o.lastRefundableAt).toBe('Wed 9 Dec, 11:59 pm');
      expect(cancellationOutlook(CHECK_IN, STAY, EARLY).lastRefundableAt).toBe(
        'Thu 17 Dec, 11:59 pm',
      );
    });

    it('is non-refundable when the charge swallows everything received', () => {
      // Booked inside the top window, so only the 50% tier is live, and the
      // advance is under its charge: an all-empty ladder is stated as one line.
      const o = cancellationOutlook(
        CHECK_IN,
        STAY,
        at('2026-12-12'),
        10_000_00,
      );

      expect(o.state).toBe('none');
      expect(o.rows).toEqual([]);
      expect(o.lastRefundableAt).toBeUndefined();
    });
  });
});
