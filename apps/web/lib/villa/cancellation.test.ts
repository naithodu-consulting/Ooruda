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
});
