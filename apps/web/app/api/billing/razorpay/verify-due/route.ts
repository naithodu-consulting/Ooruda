import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import crypto from 'crypto';

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

  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();

  // Authenticate first — no elevated (admin/RLS-bypassing) work until the
  // caller is a confirmed session. Association lookup uses the RLS client.
  const [
    {
      data: { user },
    },
    { data: assoc },
  ] = await Promise.all([
    client.auth.getUser(),
    client
      .from('associations')
      .select('account_id')
      .eq('id', associationId)
      .single(),
  ]);

  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!assoc)
    return NextResponse.json(
      { error: 'Association not found.' },
      { status: 404 },
    );

  // Membership, unit ownership, and gateway fetched in parallel.
  // associationId is known from the request body so gateway can be fetched
  // alongside the auth checks instead of waiting for them to complete.
  const [
    { data: membership },
    [{ data: ownerUnit }, { data: tenancy }],
    { data: gateway },
  ] = await Promise.all([
    client
      .from('accounts_memberships')
      .select('account_role')
      .eq('user_id', user.id)
      .eq('account_id', assoc?.account_id ?? '')
      .maybeSingle(),
    Promise.all([
      client
        .from('units')
        .select('id')
        .eq('id', unitId)
        .eq('association_id', associationId)
        .eq('owner_id', user.id)
        .maybeSingle(),
      client
        .from('tenancies')
        .select('id')
        .eq('tenant_id', user.id)
        .eq('unit_id', unitId)
        .eq('status', 'active')
        .maybeSingle(),
    ]),
    admin
      .from('association_payment_gateways')
      .select('key_id, key_secret, is_active')
      .eq('association_id', associationId)
      .maybeSingle(),
  ]);

  const role = membership?.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const unitAllowed = role === 'prop_owner' ? !!ownerUnit : !!tenancy;
  if (!unitAllowed) {
    return NextResponse.json(
      { error: 'Unit not accessible for this account.' },
      { status: 403 },
    );
  }

  if (!gateway?.is_active) {
    return NextResponse.json(
      { error: 'Online payments are not enabled for this association.' },
      { status: 422 },
    );
  }

  // Verify HMAC-SHA256 signature — proves the request corresponds to an order
  // we actually created; forged requests are rejected here.
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

  // Idempotency pre-check: if this Razorpay payment was already recorded (e.g.
  // the client's 6s fallback fired a retry), return gracefully BEFORE the amount
  // guard — by now the balance already reflects this payment and would trip it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingPayment } = await (admin as any)
    .from('cash_ledger_payments')
    .select('id')
    .eq('razorpay_payment_id', razorpayPaymentId)
    .maybeSingle();

  if (existingPayment) {
    return NextResponse.json({ paymentId: null, alreadyRecorded: true });
  }

  // Fetch the actual captured amount from Razorpay — do NOT trust the
  // client-supplied amount. The HMAC only covers orderId|paymentId, so a
  // caller could submit a low-value payment signature with an inflated amount
  // and record more credit than they actually paid.
  const rzpCredentials = Buffer.from(
    `${gateway.key_id}:${gateway.key_secret}`,
  ).toString('base64');
  const rzpPaymentRes = await fetch(
    `https://api.razorpay.com/v1/payments/${razorpayPaymentId}`,
    { headers: { Authorization: `Basic ${rzpCredentials}` } },
  );
  if (!rzpPaymentRes.ok) {
    return NextResponse.json(
      { error: 'Unable to verify payment details with Razorpay.' },
      { status: 502 },
    );
  }
  const rzpPayment = (await rzpPaymentRes.json()) as {
    amount: number;
    status: string;
  };
  if (rzpPayment.status !== 'captured') {
    return NextResponse.json(
      { error: 'Payment has not been captured.' },
      { status: 400 },
    );
  }
  const verifiedAmount = rzpPayment.amount / 100; // paise → rupees

  // Secondary guard: verified amount must not exceed the current outstanding due.
  const { data: balance, error: balanceError } = await client.rpc(
    'get_cash_ledger_balance',
    { p_unit_id: unitId, p_bill_type: billType },
  );
  if (balanceError) {
    return NextResponse.json(
      { error: 'Unable to verify outstanding due. Please try again.' },
      { status: 500 },
    );
  }
  const outstanding = -Number(balance ?? 0); // negative balance = amount owed
  if (verifiedAmount > outstanding + 0.01) {
    return NextResponse.json(
      { error: 'Amount exceeds the outstanding due.' },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentId, error } = await (admin as any).rpc(
    'record_due_payment_webhook',
    {
      p_association_id: associationId,
      p_unit_id: unitId,
      p_bill_type: billType,
      p_amount: verifiedAmount,
      p_razorpay_payment_id: razorpayPaymentId,
    },
  );

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ paymentId: null, alreadyRecorded: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ paymentId });
}
