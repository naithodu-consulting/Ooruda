import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { sendPaymentConfirmedNotification } from '~/lib/notify';

import crypto from 'crypto';

/**
 * POST /api/billing/razorpay/verify
 *
 * 1. Verifies the Razorpay payment signature using the association's key_secret.
 * 2. Calls record_payment() for each bill in billIds.
 * 3. Returns { paymentIds: string[] }.
 *
 * Body: {
 *   razorpayOrderId: string,
 *   razorpayPaymentId: string,
 *   razorpaySignature: string,
 *   billIds: string[],
 *   associationId: string,
 *   paidByRole: 'Owner' | 'Tenant',
 * }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    billIds: string[];
    associationId: string;
    paidByRole: 'Owner' | 'Tenant';
  };

  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    billIds,
    associationId,
    paidByRole,
  } = body;

  if (
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature ||
    !associationId ||
    !Array.isArray(billIds) ||
    billIds.length === 0 ||
    !['Owner', 'Tenant'].includes(paidByRole)
  ) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  // Verify caller is a member of this association.
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: assoc } = await client
    .from('associations')
    .select('account_id')
    .eq('id', associationId)
    .single();

  const { data: membership } = await client
    .from('accounts_memberships')
    .select('account_role')
    .eq('user_id', user.id)
    .eq('account_id', assoc?.account_id ?? '')
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Restrict to prop_owner / tenant — admins use the manual record-payment flow.
  const role = membership.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Resolve the caller's unit IDs to scope bill verification.
  let allowedUnitIds: string[] = [];
  if (role === 'prop_owner') {
    const { data: units } = await client
      .from('units')
      .select('id')
      .eq('association_id', associationId)
      .eq('owner_id', user.id);
    allowedUnitIds = (units ?? []).map((u) => u.id);
  } else {
    const { data: tenancies } = await client
      .from('tenancies')
      .select('unit_id')
      .eq('tenant_id', user.id)
      .eq('status', 'active');
    allowedUnitIds = (tenancies ?? []).map((t) => t.unit_id);
  }

  if (allowedUnitIds.length === 0) {
    return NextResponse.json({ error: 'No units assigned.' }, { status: 403 });
  }

  // Fetch gateway credentials.
  const admin = getSupabaseServerAdminClient();
  const { data: gateway } = await admin
    .from('association_payment_gateways')
    .select('key_secret, is_active')
    .eq('association_id', associationId)
    .maybeSingle();

  if (!gateway || !gateway.is_active) {
    return NextResponse.json(
      { error: 'Online payments are not enabled for this association.' },
      { status: 422 },
    );
  }

  // Verify HMAC-SHA256 signature: key_secret over "orderId|paymentId".
  const expectedSignature = crypto
    .createHmac('sha256', gateway.key_secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    return NextResponse.json(
      { error: 'Payment signature verification failed.' },
      { status: 400 },
    );
  }

  // Fetch bills scoped to the caller's units — enforces unit ownership.
  const { data: bills } = await client
    .from('bills')
    .select('id, total_amount, paid_amount, units!inner(unit_no)')
    .in('id', billIds)
    .in('unit_id', allowedUnitIds)
    .eq('association_id', associationId);

  if (!bills || bills.length === 0) {
    return NextResponse.json({ error: 'Bills not found.' }, { status: 404 });
  }

  // Group UUID for this batch (links multiple payments if Pay All).
  const paymentBatchId = billIds.length > 1 ? crypto.randomUUID() : null;

  // Record a payment for each bill (calls the updated record_payment RPC).
  const paymentIds: string[] = [];
  for (const bill of bills) {
    const outstanding = Number(bill.total_amount) - Number(bill.paid_amount);
    if (outstanding <= 0) continue;

    const { data: paymentId, error } = await client.rpc('record_payment', {
      p_bill_id: bill.id,
      p_association_id: associationId,
      p_amount: outstanding,
      p_mode: 'Razorpay',
      p_paid_by_role: paidByRole,
      p_razorpay_payment_id: razorpayPaymentId,
      p_razorpay_order_id: razorpayOrderId,
      p_payment_batch_id: paymentBatchId ?? undefined,
    });

    if (error) {
      // If one bill already paid (duplicate submission), skip it rather than failing all.
      if (error.code === '23505') continue;
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (paymentId) paymentIds.push(paymentId as string);
  }

  // Fire-and-forget: send a payment confirmation SMS to the payer.
  if (paymentIds.length > 0) {
    const totalPaid = bills.reduce((sum, b) => {
      const outstanding = Number(b.total_amount) - Number(b.paid_amount);
      return sum + (outstanding > 0 ? outstanding : 0);
    }, 0);
    const unitNos = [
      ...new Set(
        bills.map(
          (b) => (b.units as { unit_no: string } | null)?.unit_no ?? '',
        ),
      ),
    ]
      .filter(Boolean)
      .join(', ');

    void sendPaymentConfirmedNotification({
      associationId,
      recipientUserId: user.id,
      unitNo: unitNos,
      amount: totalPaid,
      mode: 'Razorpay',
    });
  }

  return NextResponse.json({ paymentIds });
}
