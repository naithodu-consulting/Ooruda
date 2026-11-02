import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';

import type { Database } from '~/lib/database.types';
import { type SiteBooking, listSitePayments } from '~/lib/villa-db/bookings';
import type { VillaSite } from '~/lib/villa-db/client';

import { summariseLedger } from './ledger';

/**
 * Has any money actually been received against this booking, and not given
 * back?
 *
 * The one rule behind "no confirmation email until the guest has paid
 * something". It asks the SAME source the email's own figures come from:
 * Ooruda's ledger — website (Razorpay) payments, which live on the booking
 * site, plus offline receipts in villa_booking_payments, less refunds. A
 * villa_booking_payments check alone would be wrong in both directions: it
 * holds no website money at all (so every fully-paid website booking would
 * look unpaid and lose its "Send again"), and it ignores refunds (so a
 * refunded stay would still be sent a refund ladder).
 *
 * It deliberately does not consult the booking's `payment_status`: staff can
 * set a stay to "partially paid" and leave the amount blank, in which case no
 * receipt is written and no money exists.
 *
 * Fails CLOSED: anything that errors counts as nothing received, so the worst
 * case is an email staff send by hand, never a refund promise against money
 * that was never received.
 */
export async function hasRecordedPayment(
  client: SupabaseClient<Database>,
  site: VillaSite,
  propertyId: string,
  booking: SiteBooking,
): Promise<boolean> {
  return (await netPaidPaise(client, site, propertyId, booking)) > 0;
}

/** What the guest has paid, net of refunds, in paise. 0 on any failure. */
async function netPaidPaise(
  client: SupabaseClient<Database>,
  site: VillaSite,
  propertyId: string,
  booking: SiteBooking,
): Promise<number> {
  try {
    const [online, offline, refunds] = await Promise.all([
      // The booking was read from this property, so it is already scoped.
      listSitePayments(site, booking.id, { verified: true }),
      client
        .from('villa_booking_payments')
        .select('amount, voided_at')
        .eq('property_id', propertyId)
        .eq('site_booking_id', booking.id),
      client
        .from('villa_refunds')
        .select('amount, status')
        .eq('property_id', propertyId)
        .eq('site_booking_id', booking.id),
    ]);

    if (offline.error || refunds.error) {
      (await getLogger()).error(
        {
          propertyId,
          siteBookingId: booking.id,
          code: (offline.error ?? refunds.error)!.code,
        },
        'villa booking payment check failed; treating as unpaid',
      );

      return 0;
    }

    return summariseLedger({
      totalPaise: booking.totalAmountPaise,
      bookingStatus: booking.status,
      online: online.map((p) => ({
        amountPaise: p.amountPaise,
        status: p.status,
      })),
      offline: (offline.data ?? []).map((p) => ({
        amount: Number(p.amount),
        voided: Boolean(p.voided_at),
      })),
      refunds: (refunds.data ?? []).map((r) => ({
        amount: Number(r.amount),
        status: r.status,
      })),
    }).netPaidPaise;
  } catch (error) {
    // A booking site that will not answer must not become a sent email.
    (await getLogger()).error(
      { propertyId, siteBookingId: booking.id, error: String(error) },
      'villa booking payment check failed; treating as unpaid',
    );

    return 0;
  }
}

/** Why the confirmation is held back, in the words staff see. */
export const NO_PAYMENT_REASON = 'no payment recorded against this booking';
