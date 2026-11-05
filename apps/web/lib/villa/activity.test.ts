import { describe, expect, it, vi } from 'vitest';

import { recordBookingActivity } from './activity';
import { BOOKING_ACTIVITY_ACTIONS } from './constants';
import { ACTIVITY_LABELS, activityLabel } from './labels';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const mockInsert = vi.fn().mockReturnValue(Promise.resolve({ error: null }));
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

vi.mock('@kit/supabase/server-admin-client', () => ({
  getSupabaseServerAdminClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@kit/shared/logger', () => ({
  getLogger: vi.fn().mockResolvedValue({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('recordBookingActivity', () => {
  it('inserts activity row with correct parameters', async () => {
    mockInsert.mockClear();

    await recordBookingActivity(
      {
        accountId: 'acc-123',
        propertyId: 'prop-456',
        booking: { id: 'book-789', bookingCode: 'V19-ABC' },
        action: 'payment_recorded',
        note: '₹10,000 via UPI (Receipt REC-001)',
      },
      'user-admin-1',
    );

    expect(mockFrom).toHaveBeenCalledWith('villa_booking_activity');
    expect(mockInsert).toHaveBeenCalledWith({
      account_id: 'acc-123',
      property_id: 'prop-456',
      site_booking_id: 'book-789',
      booking_code: 'V19-ABC',
      action: 'payment_recorded',
      reason_code: null,
      note: '₹10,000 via UPI (Receipt REC-001)',
      actor_user_id: 'user-admin-1',
    });
  });

  it('inserts activity row with null actor when automated/system', async () => {
    mockInsert.mockClear();

    await recordBookingActivity(
      {
        accountId: 'acc-123',
        propertyId: 'prop-456',
        booking: { id: 'book-789' },
        action: 'email_sent',
        note: 'Booking confirmation sent automatically',
      },
      null,
    );

    expect(mockInsert).toHaveBeenCalledWith({
      account_id: 'acc-123',
      property_id: 'prop-456',
      site_booking_id: 'book-789',
      booking_code: null,
      action: 'email_sent',
      reason_code: null,
      note: 'Booking confirmation sent automatically',
      actor_user_id: null,
    });
  });
});

describe('ACTIVITY_LABELS', () => {
  it('has readable labels for all actions', () => {
    for (const action of BOOKING_ACTIVITY_ACTIONS) {
      expect(ACTIVITY_LABELS[action]).toBeDefined();
      expect(typeof ACTIVITY_LABELS[action]).toBe('string');
      expect(activityLabel(action)).toBe(ACTIVITY_LABELS[action]);
    }
  });

  it('returns action itself if unrecognized', () => {
    expect(activityLabel('unknown_action')).toBe('unknown_action');
  });
});

describe('the database constraint and the TypeScript union agree', () => {
  /**
   * The quiet failure this guards: an action added in TypeScript but not to
   * the check constraint fails its insert with 23514, which
   * `recordBookingActivity` swallows into `auditWritten: false`. The business
   * action still happens - a money adjustment, a void - with no audit row,
   * surfaced only as a toast the operator can dismiss.
   */
  it('lists exactly the same actions', () => {
    const dir = join(__dirname, '../../supabase/migrations');

    // The newest migration that rewrites the constraint is the live one.
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .reverse()
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .find((sql) => sql.includes('villa_booking_activity_action_check'));

    expect(latest).toBeDefined();

    const block = /check \(action in \(([^)]*)\)\)/.exec(latest!);

    expect(block).not.toBeNull();

    const inSql = [...block![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);

    expect([...inSql].sort()).toEqual([...BOOKING_ACTIVITY_ACTIONS].sort());
  });
});
