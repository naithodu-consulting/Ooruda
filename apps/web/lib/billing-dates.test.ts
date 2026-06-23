import { describe, expect, it } from 'vitest';

import {
  daysBetweenYmd,
  formatYmdLong,
  todayInBillingZone,
} from './billing-dates';

/**
 * These assert the timezone-safety property: the helpers must return the same
 * result regardless of the host's local timezone, since `due_date` is a plain
 * calendar date with no time component.
 */
describe('daysBetweenYmd', () => {
  it('counts whole days forward', () => {
    expect(daysBetweenYmd('2026-06-10', '2026-06-17')).toBe(7);
  });

  it('is negative before the from date and zero on the same day', () => {
    expect(daysBetweenYmd('2026-06-10', '2026-06-09')).toBe(-1);
    expect(daysBetweenYmd('2026-06-10', '2026-06-10')).toBe(0);
  });

  it('crosses month and year boundaries correctly', () => {
    expect(daysBetweenYmd('2026-06-28', '2026-07-01')).toBe(3);
    expect(daysBetweenYmd('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('does not depend on the time portion of an ISO timestamp', () => {
    // A bug-prone case: a late-evening "today" must not read as a day ahead.
    expect(daysBetweenYmd('2026-06-10', '2026-06-10T23:59:59Z')).toBe(0);
  });

  it('returns 0 for unparseable input rather than NaN', () => {
    expect(daysBetweenYmd('', '2026-06-10')).toBe(0);
    expect(daysBetweenYmd('not-a-date', '2026-06-10')).toBe(0);
  });
});

describe('todayInBillingZone', () => {
  it('resolves to the IST calendar day even when UTC is still the day before', () => {
    // 2026-06-09 20:00 UTC is already 2026-06-10 01:30 IST.
    const instant = new Date('2026-06-09T20:00:00Z');
    expect(todayInBillingZone(instant)).toBe('2026-06-10');
  });

  it('returns a YYYY-MM-DD string', () => {
    expect(todayInBillingZone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatYmdLong', () => {
  it('formats without shifting the day across timezones', () => {
    expect(formatYmdLong('2026-06-10')).toBe('10 Jun 2026');
    expect(formatYmdLong('2026-01-01')).toBe('1 Jan 2026');
  });

  it('returns the raw input when unparseable', () => {
    expect(formatYmdLong('')).toBe('');
  });
});
