import { toPaise } from './money';

/**
 * A booking's money in one place: website payments (on the booking site,
 * paise) and offline receipts and refunds (in Ooruda, rupees). Worked in
 * integer paise so nothing drifts. Pure.
 */

export interface OnlinePayment {
  amountPaise: number;
  /** created | captured | failed | refunded (booking site) */
  status: string;
}

export interface OfflinePayment {
  amount: number;
  voided: boolean;
}

export interface Refund {
  amount: number;
  status: string;
}

export type LedgerStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded';

export interface LedgerSummary {
  totalPaise: number;
  onlinePaise: number;
  offlinePaise: number;
  refundedPaise: number;
  /** Received less refunded. */
  netPaidPaise: number;
  /** Still owed (never negative). */
  duePaise: number;
  /** Paid in beyond the total (to refund or adjust). */
  excessPaise: number;
  status: LedgerStatus;
}

export function summariseLedger(input: {
  totalPaise: number;
  bookingStatus: string;
  online: OnlinePayment[];
  offline: OfflinePayment[];
  refunds: Refund[];
}): LedgerSummary {
  const onlinePaise = input.online
    .filter((p) => p.status === 'captured')
    .reduce((sum, p) => sum + p.amountPaise, 0);
  // A website payment refunded from the Razorpay dashboard: counted as
  // received and fully given back.
  const onlineRefundedPaise = input.online
    .filter((p) => p.status === 'refunded')
    .reduce((sum, p) => sum + p.amountPaise, 0);

  const offlinePaise = input.offline
    .filter((p) => !p.voided)
    .reduce((sum, p) => sum + toPaise(p.amount), 0);
  const refundedPaise =
    input.refunds
      .filter((r) => r.status !== 'failed')
      .reduce((sum, r) => sum + toPaise(r.amount), 0) + onlineRefundedPaise;

  const receivedPaise = onlinePaise + onlineRefundedPaise + offlinePaise;
  const netPaidPaise = receivedPaise - refundedPaise;
  const duePaise = Math.max(0, input.totalPaise - netPaidPaise);
  const excessPaise = Math.max(0, netPaidPaise - input.totalPaise);

  let status: LedgerStatus;

  if (receivedPaise > 0 && netPaidPaise <= 0) status = 'refunded';
  else if (netPaidPaise <= 0) status = 'unpaid';
  else if (duePaise === 0) status = 'paid';
  else status = 'partially_paid';

  // A cancelled stay owes nothing more: what is kept is kept.
  if (input.bookingStatus === 'cancelled' && status === 'partially_paid') {
    return { ...summary(), duePaise: 0 };
  }

  return summary();

  function summary(): LedgerSummary {
    return {
      totalPaise: input.totalPaise,
      onlinePaise: onlinePaise + onlineRefundedPaise,
      offlinePaise,
      refundedPaise,
      netPaidPaise,
      duePaise,
      excessPaise,
      status,
    };
  }
}

/**
 * What to write to the booking site's payment_status. 'paid' is held back
 * while confirming 'paid' on the site still issues a GST invoice at once
 * (villa-booking TODO 8c): invoices are issued at check-out. Until then a
 * fully paid stay shows 'partially_paid' there; Ooruda's own ledger is exact.
 */
export const SITE_PAID_ISSUES_INVOICE = true;

export function sitePaymentStatus(status: LedgerStatus): LedgerStatus {
  return status === 'paid' && SITE_PAID_ISSUES_INVOICE
    ? 'partially_paid'
    : status;
}
