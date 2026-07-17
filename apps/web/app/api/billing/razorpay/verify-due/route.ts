import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import crypto from 'crypto';

/**
 * POST /api/billing/razorpay/verify-due
 *
 * Synchronous verification step for cash-ledger due payments.
 * Called immediately from the Razorpay checkout handler (same as /verify for bills).
 *
 * 1. Verifies HMAC-SHA256 signature.
 * 2. Validates caller owns/rents the unit.
 * 3. Calls record_due_payment_webhook() via admin client to record the payment
 *    and credit the cash ledger.
 *
 * The async webhook is the safety net for cases where this call doesn't reach
 * the server. The unique index on razorpay_payment_id prevents double-recording.
 *
 * Body: {
 *   razorpayOrderId, razorpayPaymentId, razorpaySignature,
 *   associationId, unitId, billType, amount
 * }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    associationId: string;
    unitId: string;
    billType: string;
    amount: number;
  };

  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    associationId,
    unitId,
    billType,
    amount,
  } = body;

  if (
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature ||
    !associationId ||
    !unitId ||
    !billType ||
    !amount ||
    amount <= 0
  ) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  // Verify caller is authenticated and is a prop_owner / tenant.
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

  const role = membership?.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Confirm the caller owns/rents the unit being paid.
  let unitAllowed = false;
  if (role === 'prop_owner') {
    const { data: unit } = await client
      .from('units')
      .select('id')
      .eq('id', unitId)
      .eq('association_id', associationId)
      .eq('owner_id', user.id)
      .maybeSingle();
    unitAllowed = !!unit;
  } else {
    const { data: tenancy } = await client
      .from('tenancies')
      .select('id')
      .eq('tenant_id', user.id)
      .eq('unit_id', unitId)
      .eq('status', 'active')
      .maybeSingle();
    unitAllowed = !!tenancy;
  }

  if (!unitAllowed) {
    return NextResponse.json(
      { error: 'Unit not accessible for this account.' },
      { status: 403 },
    );
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

  // Record the due payment and credit the cash ledger (admin client = service_role).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentId, error } = await (admin as any).rpc(
    'record_due_payment_webhook',
    {
      p_association_id: associationId,
      p_unit_id: unitId,
      p_bill_type: billType,
      p_amount: amount,
      p_razorpay_payment_id: razorpayPaymentId,
    },
  );

  if (error) {
    // Already recorded (webhook beat us) — treat as success.
    if (error.code === '23505') {
      return NextResponse.json({ paymentId: null, alreadyRecorded: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ paymentId });
}
