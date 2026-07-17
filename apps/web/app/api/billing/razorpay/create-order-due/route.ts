import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * POST /api/billing/razorpay/create-order-due
 *
 * Creates a Razorpay order for a cash-ledger due (no bill ID involved).
 * Only prop_owner / tenant may call this — admins use the manual record flow.
 *
 * Body: { associationId, unitId, billType, amount }
 */
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
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve account_id for this association.
  const { data: assoc } = await client
    .from('associations')
    .select('account_id')
    .eq('id', associationId)
    .single();

  if (!assoc) {
    return NextResponse.json(
      { error: 'Association not found' },
      { status: 404 },
    );
  }

  // Only prop_owner / tenant may pay online.
  const { data: membership } = await client
    .from('accounts_memberships')
    .select('account_role')
    .eq('user_id', user.id)
    .eq('account_id', assoc.account_id)
    .maybeSingle();

  const role = membership?.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify the caller actually owns/rents the unit they're paying for.
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

  const admin = getSupabaseServerAdminClient();
  const { data: gateway } = await admin
    .from('association_payment_gateways')
    .select('key_id, key_secret, is_active')
    .eq('association_id', associationId)
    .maybeSingle();

  if (!gateway || !gateway.is_active) {
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
