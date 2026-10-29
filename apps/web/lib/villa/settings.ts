import 'server-only';
import { cache } from 'react';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * One villa account's own settings (Ooruda's, not the booking site's).
 *
 * There is at most one row per account and half a dozen screens need a column
 * or two from it, so before this loader a single page could read the table
 * three times — the Bookings page for the cutoff, the booking page for
 * `managers_can_cancel`, its guest-emails card for the three e-mail switches.
 * On a remote database each of those is a round trip. Request-cached: every
 * caller in one request shares one read.
 */
export interface VillaAccountSettings {
  bookingCutoffDate: string | null;
  managersCanCancel: boolean;
  bookingConfirmationEmail: boolean;
  preArrivalEmail: boolean;
  thankYouEmail: boolean;
}

/**
 * What every caller assumed before this loader existed, and what a failed read
 * falls back to. Each one fails CLOSED: no cutoff shown, managers cannot
 * cancel, the two optional guest emails stay off. The cutoff is enforced again
 * server-side when a booking is actually saved, so a missing banner cannot let
 * a past-cutoff stay through.
 */
const DEFAULTS: VillaAccountSettings = {
  bookingCutoffDate: null,
  managersCanCancel: false,
  bookingConfirmationEmail: true,
  preArrivalEmail: false,
  thankYouEmail: false,
};

export const loadVillaAccountSettings = cache(
  async (accountId: string): Promise<VillaAccountSettings> => {
    const { data, error } = await getSupabaseServerClient()
      .from('villa_account_settings')
      .select(
        'booking_cutoff_date, managers_can_cancel, booking_confirmation_email, pre_arrival_email, thank_you_email',
      )
      .eq('account_id', accountId)
      .maybeSingle();

    // A settings row is a small side input to pages whose real content is
    // bookings and the calendar. Failing the whole page over it would make a
    // transient database blip a 500 on the two busiest villa screens, so this
    // degrades to the safe defaults and records why.
    if (error) {
      (await getLogger()).error(
        { accountId, code: error.code },
        'villa account settings load failed; using defaults',
      );

      return DEFAULTS;
    }

    // No row yet is normal: a villa gets one on its first change.
    if (!data) return DEFAULTS;

    return {
      bookingCutoffDate: data.booking_cutoff_date ?? null,
      managersCanCancel: data.managers_can_cancel ?? false,
      bookingConfirmationEmail: data.booking_confirmation_email ?? true,
      preArrivalEmail: data.pre_arrival_email ?? false,
      thankYouEmail: data.thank_you_email ?? false,
    };
  },
);
