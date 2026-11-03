import { describe, expect, it } from 'vitest';

import {
  type DiscountAuditRow,
  buildDiscountHistory,
} from './discount-history';

/** Audit rows as PostgREST returns them: numerics as strings. */
function row(
  action: string,
  terms: Record<string, unknown>,
  at = '2026-11-02T08:00:00Z',
): DiscountAuditRow {
  return { action, created_at: at, actor_name: 'Nisha', terms };
}

const base = {
  code: 'MONSOON10',
  discount_type: 'percent',
  discount_value: '10.00',
  max_discount: '2500.00',
  valid_from: '2026-10-01',
  valid_to: '2026-10-31',
  min_nights: 1,
  min_booking_value: '0.00',
  max_uses: null,
  max_uses_per_guest: 1,
  blackouts: [],
  note: null,
};

describe('buildDiscountHistory', () => {
  it('names the fields that changed, newest first', () => {
    const history = buildDiscountHistory([
      row('updated', { ...base, discount_value: '15.00', note: 'Diwali' }),
      row('created', base),
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]!.changes).toEqual([
      { label: 'Discount', from: '10% off', to: '15% off' },
      { label: 'Note', from: 'None', to: 'Diwali' },
    ]);
    // 'created' is the baseline, not a change.
    expect(history[1]!.changes).toEqual([]);
    expect(history[1]!.unknownBefore).toBe(false);
  });

  it('does not read a change of scale as an edit', () => {
    const history = buildDiscountHistory([
      row('updated', { ...base, discount_value: 10, min_booking_value: 0 }),
      row('created', base),
    ]);

    expect(history[0]!.changes).toEqual([]);
  });

  it('keeps a numeric-looking code a string', () => {
    // '0100' and '100' are different codes, however they coerce.
    const history = buildDiscountHistory([
      row('updated', { ...base, code: '0100' }),
      row('created', { ...base, code: '100' }),
    ]);

    expect(history[0]!.changes).toEqual([
      { label: 'Code', from: '100', to: '0100' },
    ]);
  });

  it('tells "no limit" apart from zero', () => {
    const history = buildDiscountHistory([
      row('updated', { ...base, max_uses: 0 }),
      row('created', { ...base, max_uses: null }),
    ]);

    expect(history[0]!.changes).toEqual([
      { label: 'Total uses allowed', from: 'No limit', to: '0' },
    ]);
  });

  it('compares blackouts by value', () => {
    const blackouts = [{ start: '2026-12-24', end: '2026-12-26' }];

    const unchanged = buildDiscountHistory([
      row('updated', { ...base, blackouts: [...blackouts] }),
      row('created', { ...base, blackouts }),
    ]);
    expect(unchanged[0]!.changes).toEqual([]);

    const changed = buildDiscountHistory([
      row('updated', { ...base, blackouts }),
      row('created', base),
    ]);
    expect(changed[0]!.changes).toEqual([
      {
        label: 'Blackout nights',
        from: 'None',
        to: '24 Dec 2026 – 25 Dec 2026',
      },
    ]);
  });

  it('shows a blackout that moved, not just how many there are', () => {
    // Same count, different nights: "2 ranges → 2 ranges" would hide it.
    const history = buildDiscountHistory([
      row('updated', {
        ...base,
        blackouts: [{ start: '2026-12-31', end: '2027-01-01' }],
      }),
      row('created', {
        ...base,
        blackouts: [{ start: '2026-12-24', end: '2026-12-25' }],
      }),
    ]);

    expect(history[0]!.changes).toEqual([
      {
        label: 'Blackout nights',
        from: '24 Dec 2026',
        to: '31 Dec 2026',
      },
    ]);
  });

  it('does not count a status-only change as an edit of the terms', () => {
    // An edit that voids an approval rewrites status and approved_by; those
    // are not terms, and the action label already says what happened.
    const history = buildDiscountHistory([
      row('updated', {
        ...base,
        status: 'pending_approval',
        approved_by: null,
      }),
      row('created', { ...base, status: 'active', approved_by: 'u1' }),
    ]);

    expect(history[0]!.changes).toEqual([]);
  });

  it('says so when the terms before a change were never recorded', () => {
    const history = buildDiscountHistory([
      row('updated', { ...base, discount_value: '15.00' }),
    ]);

    expect(history[0]!.changes).toEqual([]);
    expect(history[0]!.unknownBefore).toBe(true);
  });

  it('never claims unknown terms for an action that is not an edit', () => {
    const history = buildDiscountHistory([row('archived', base)]);

    expect(history[0]!.unknownBefore).toBe(false);
    expect(history[0]!.action).toBe('archived');
  });

  it('is empty for a code with no audit rows', () => {
    expect(buildDiscountHistory([])).toEqual([]);
  });
});
