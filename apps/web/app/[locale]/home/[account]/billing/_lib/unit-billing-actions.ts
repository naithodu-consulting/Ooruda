'use server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { BillDetail } from './unit-billing-types';

type DetailResult = { success: boolean; error?: string; detail?: BillDetail };

/**
 * Loads the line items for a single bill, fetched lazily when an admin expands
 * a bill row. Payment history lives in the Payments module, not here.
 *
 * Uses the authenticated client so RLS scopes the read to associations the
 * caller is a member of - an id belonging to another association returns no
 * rows rather than leaking data.
 */
export async function fetchBillDetailAction(
  billId: string,
): Promise<DetailResult> {
  if (!billId) {
    return { success: false, error: 'Missing bill id.' };
  }

  const client = getSupabaseServerClient();

  const { data, error } = await client
    .from('bill_line_items')
    .select(
      'id, description, payer, gst_applicable, amount, area_sqft, rate_per_sqft',
    )
    .eq('bill_id', billId)
    .order('description');

  if (error) {
    return { success: false, error: 'Could not load the bill breakdown.' };
  }

  const lineItems = (data ?? []).map((li) => ({
    id: li.id,
    description: li.description,
    payer: li.payer,
    gst_applicable: li.gst_applicable,
    amount: Number(li.amount),
    area_sqft: li.area_sqft != null ? Number(li.area_sqft) : null,
    rate_per_sqft: li.rate_per_sqft != null ? Number(li.rate_per_sqft) : null,
  }));

  return { success: true, detail: { lineItems } };
}
