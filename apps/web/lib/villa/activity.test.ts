import { describe, expect, it, vi } from 'vitest';

import { recordBookingActivity } from './activity';
import type { BookingActivityAction } from './constants';
import { ACTIVITY_LABELS, activityLabel } from './labels';

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
  const actions: BookingActivityAction[] = [
    'created',
    'cancelled',
    'completed',
    'reopened',
    'checked_in',
    'booking_updated',
    'enrichment_voided',
    'note',
    'payment_recorded',
    'payment_voided',
    'refund_recorded',
    'id_recorded',
    'id_verified',
    'id_deleted',
    'email_sent',
    'guest_added',
    'guest_removed',
  ];

  it('has readable labels for all actions', () => {
    for (const action of actions) {
      expect(ACTIVITY_LABELS[action]).toBeDefined();
      expect(typeof ACTIVITY_LABELS[action]).toBe('string');
      expect(activityLabel(action)).toBe(ACTIVITY_LABELS[action]);
    }
  });

  it('returns action itself if unrecognized', () => {
    expect(activityLabel('unknown_action')).toBe('unknown_action');
  });
});
