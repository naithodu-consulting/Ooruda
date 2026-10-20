import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { VillaRole } from '~/lib/roles';
import type { SiteBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { fromPaise } from '~/lib/villa/money';

import { loadLedger } from '../_lib/server/payments.service';
import { PaymentsPanel } from './payments-panel';

/**
 * Money for one booking: website payments (read from the booking site),
 * offline receipts and refunds (Ooruda), and what is still due. Rendered in
 * Suspense on the booking page.
 */
export async function PaymentsSection(props: {
  accountId: string;
  propertyId: string;
  booking: SiteBooking;
  role: VillaRole;
}) {
  const site = await getVillaSite(props.accountId, props.propertyId);
  const ledger = await loadLedger(
    getSupabaseServerClient(),
    site,
    props.booking,
  );
  const s = ledger.summary;

  return (
    <PaymentsPanel
      accountId={props.accountId}
      propertyId={props.propertyId}
      bookingId={props.booking.id}
      bookingStatus={props.booking.status}
      guestName={props.booking.guestName}
      isOwner={props.role === 'villa_admin'}
      summary={{
        total: fromPaise(s.totalPaise),
        received: fromPaise(s.onlinePaise + s.offlinePaise),
        refunded: fromPaise(s.refundedPaise),
        due: fromPaise(s.duePaise),
        excess: fromPaise(s.excessPaise),
        status: s.status,
      }}
      online={ledger.online
        .filter((p) => p.status !== 'created')
        .map((p) => ({
          id: p.id,
          amount: fromPaise(p.amountPaise),
          status: p.status,
          date: p.createdAt,
          reference: p.razorpayPaymentId,
        }))}
      receipts={ledger.payments.map((p) => {
        const refunds = ledger.refunds.filter((r) => r.payment_id === p.id);
        const refunded = refunds
          .filter((r) => r.status !== 'failed')
          .reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);

        return {
          id: p.id,
          receiptNo: p.receipt_no,
          mode: p.mode,
          amount: Number(p.amount),
          paidOn: p.paid_on,
          reference: p.reference,
          payerName: p.payer_name,
          voided: Boolean(p.voided_at),
          voidReason: p.void_reason,
          refundable: p.voided_at
            ? 0
            : (Math.round(Number(p.amount) * 100) - refunded) / 100,
          refunds: refunds.map((r) => ({
            id: r.id,
            refundNo: r.refund_no,
            amount: Number(r.amount),
            refundedOn: r.refunded_on,
            reason: r.reason,
            mode: r.mode,
          })),
        };
      })}
    />
  );
}
