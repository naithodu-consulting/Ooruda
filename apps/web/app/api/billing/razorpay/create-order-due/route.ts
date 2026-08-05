import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    associationId: string;
    unitId: string;
    billType: string;
    amount: number;
  };

  const { associationId, unitId, billType, amount } = body;

  if (!associationId || !unitId || !billType || !amount || amount <= 0) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();

  // Authenticate first — no elevated (admin/RLS-bypassing) work until we know
  // the caller is a real session. Association lookup uses the RLS client.
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
      { error: 'Association not found' },
      { status: 404 },
    );

  // Membership, unit ownership, and gateway all fetched in parallel.
  // associationId is known from the request body so gateway can be included here.
  const [{ data: membership }, unitAllowedResult, { data: gateway }] = await Promise.all([
    client
      .from('accounts_memberships')
      .select('account_role')
      .eq('user_id', user.id)
      .eq('account_id', assoc.account_id)
      .maybeSingle(),
    // Pre-fetch both unit and tenancy — we'll pick the right one after knowing role.
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

  const [{ data: ownerUnit }, { data: tenancy }] = unitAllowedResult;
  const unitAllowed = role === 'prop_owner' ? !!ownerUnit : !!tenancy;
  if (!unitAllowed) {
    return NextResponse.json(
      { error: 'Unit not accessible for this account.' },
      { status: 403 },
    );
  }

  // Validate the amount against the actual outstanding due (server-authoritative).
  // Prevents a tampered body from creating a phantom advance credit or an
  // order for an amount unrelated to what is actually owed.
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
  if (outstanding <= 0) {
    return NextResponse.json(
      { error: 'No outstanding due for this unit and bill type.' },
      { status: 422 },
    );
  }
  if (amount > outstanding + 0.01) {
    return NextResponse.json(
      { error: 'Amount exceeds the outstanding due.' },
      { status: 400 },
    );
  }

  if (!gateway?.is_active) {
    return NextResponse.json(
      { error: 'Online payments are not enabled for this association.' },
      { status: 422 },
    );
  }

  const paidByRole = role === 'prop_owner' ? 'Owner' : 'Tenant';
  const amountPaise = Math.round(amount * 100);
  const encoded = Buffer.from(
    `${gateway.key_id}:${gateway.key_secret}`,
  ).toString('base64');

  const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: `due-${unitId.slice(0, 8)}`,
      notes: {
        is_due: 'true',
        unit_id: unitId,
        bill_type: billType,
        association_id: associationId,
        paid_by_role: paidByRole,
      },
    }),
  });

  if (!rzpRes.ok) {
    const err = await rzpRes.json().catch(() => ({}));
    return NextResponse.json(
      {
        error:
          (err as { error?: { description?: string } }).error?.description ??
          'Razorpay order creation failed.',
      },
      { status: 502 },
    );
  }

  const order = (await rzpRes.json()) as { id: string };

  return NextResponse.json({
    orderId: order.id,
    keyId: gateway.key_id,
    amount: amountPaise,
    currency: 'INR',
  });
}
