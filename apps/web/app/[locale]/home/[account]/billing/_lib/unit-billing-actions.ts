'use server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { BillDetail } from './unit-billing-types';

type DetailResult = { success: boolean; error?: string; detail?: BillDetail };

/**
 * Loads the line items and payment history for a single bill.
 *
 * Called when an admin expands a bill-type row in the unit-centric billing
 * table. Keeping this off the initial page payload is what lets the page fetch
 * every bill for the association up front without shipping thousands of line
 * item rows the admin will never look at.
 *
 * Uses the authenticated client so RLS scopes the read to associations the
 * caller is a member of — an id belonging to another association returns no
 * rows rather than leaking data.
 */
export async function fetchBillDetailAction(
  billId: string,
): Promise<DetailResult> {
  if (!billId) {
    return { success: false, error: 'Missing bill id.' };
  }

  const client = getSupabaseServerClient();

  const [lineItemsResult, paymentsResult] = await Promise.all([
    client
      .from('bill_line_items')
      .select(
        'id, description, payer, gst_applicable, amount, area_sqft, rate_per_sqft',
      )
      .eq('bill_id', billId)
      .order('description'),
    client
      .from('payments')
      .select(
        'id, amount, mode, paid_at, reference_no, paid_by_role, status, reversed_at, receipts(receipt_no)',
      )
      .eq('bill_id', billId)
      .order('paid_at', { ascending: false }),
  ]);

  if (lineItemsResult.error) {
    return { success: false, error: 'Could not load the bill breakdown.' };
  }

  const lineItems = (lineItemsResult.data ?? []).map((li) => ({
    id: li.id,
    description: li.description,
    payer: li.payer,
    gst_applicable: li.gst_applicable,
    amount: Number(li.amount),
    area_sqft: li.area_sqft != null ? Number(li.area_sqft) : null,
    rate_per_sqft: li.rate_per_sqft != null ? Number(li.rate_per_sqft) : null,
  }));

  const payments = (paymentsResult.data ?? []).map((p) => {
    // `receipts` comes back as an array on a one-to-many embed even though a
    // payment has at most one receipt.
    const receipt = Array.isArray(p.receipts) ? p.receipts[0] : p.receipts;

    return {
      id: p.id,
      amount: Number(p.amount),
      mode: p.mode,
      paid_at: p.paid_at,
      reference_no: p.reference_no,
      paid_by_role: p.paid_by_role,
      status: p.status,
      reversed_at: p.reversed_at,
      receipt_no:
        (receipt as unknown as { receipt_no: string } | null)?.receipt_no ??
        null,
    };
  });

  return { success: true, detail: { lineItems, payments } };
}
