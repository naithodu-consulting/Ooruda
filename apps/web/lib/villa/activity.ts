import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { BookingActivityAction } from './constants';

export interface RecordBookingActivityParams {
  accountId: string;
  propertyId: string;
  booking: { id: string; bookingCode?: string | null };
  action: BookingActivityAction;
  reasonCode?: string | null;
  note?: string | null;
}

/**
 * Appends an entry to the booking activity log. Service role only; failures
 * are logged rather than thrown so an audit write never fails an already-completed
 * business action.
 */
export async function recordBookingActivity(
  entry: RecordBookingActivityParams,
  actor?: string | null,
): Promise<void> {
  const { error } = await getSupabaseServerAdminClient()
    .from('villa_booking_activity')
    .insert({
      account_id: entry.accountId,
      property_id: entry.propertyId,
      site_booking_id: entry.booking.id,
      booking_code: entry.booking.bookingCode ?? null,
      action: entry.action,
      reason_code: entry.reasonCode ?? null,
      note: entry.note || null,
      actor_user_id: actor ?? null,
    });

  if (error) {
    (await getLogger()).error(
      {
        bookingId: entry.booking.id,
        action: entry.action,
        code: error.code,
        message: error.message,
      },
      'villa booking activity write failed',
    );
  }
}
