/**
 * Shared statement entry shape.
 *
 * Lives here (not in the client table component) so the server-side statement
 * service can reference it without importing a `'use client'` module.
 */
export interface StatementEntry {
  id: string;
  unit_id: string;
  unit_no: string;
  entry_type:
    | 'due'
    | 'advance_payment'
    | 'advance_applied'
    | 'due_payment'
    | 'reversal';
  bill_type: string;
  bill_no: string | null;
  /** Resolved charge name from bill line items (e.g. "Water Charges"). Overrides generic bill_type label. */
  charge_name: string | null;
  amount: number;
  direction: 'debit' | 'credit';
  entry_date: string;
  notes: string | null;
  mode: string | null;
  /** Set on due_payment entries affected by a Razorpay refund. */
  payment_status?: 'active' | 'reversed' | 'partial_refund';
  /** Amount already refunded (only set when payment_status='partial_refund'). */
  refunded_amount?: number;
  runningBalance: number;
}
