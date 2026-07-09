import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * POST /api/billing/razorpay/create-order
 *
 * Creates a Razorpay order using the association's own credentials.
 * Returns { orderId, keyId, amount, currency } — the key_secret never leaves the server.
 *
 * Body: { billIds: string[], associationId: string }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    billIds: string[];
    associationId: string;
  };

  const { billIds, associationId } = body;

  if (!associationId || !Array.isArray(billIds) || billIds.length === 0) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  // Verify the caller is a member of this association.
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await client
    .from('accounts_memberships')
    .select('account_role')
    .eq('user_id', user.id)
    .eq(
      'account_id',
      (
        await client
          .from('associations')
          .select('account_id')
          .eq('id', associationId)
          .single()
      ).data?.account_id ?? '',
    )
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Restrict to prop_owner / tenant — admins use the manual record-payment flow.
  const role = membership.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Resolve the caller's unit IDs so we can scope the bill query.
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

  // Fetch gateway credentials using admin client (no authenticated RLS policy).
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

  // Fetch bills scoped to the caller's units — this enforces unit ownership.
  const { data: bills } = await client
    .from('bills')
    .select('id, total_amount, paid_amount')
    .in('id', billIds)
    .in('unit_id', allowedUnitIds)
    .eq('association_id', associationId);

  if (!bills || bills.length !== billIds.length) {
    return NextResponse.json(
      { error: 'One or more bills not found.' },
      { status: 404 },
    );
  }

  const totalOutstanding = bills.reduce(
    (sum, b) => sum + (Number(b.total_amount) - Number(b.paid_amount)),
    0,
  );

  if (totalOutstanding <= 0) {
    return NextResponse.json(
      { error: 'No outstanding amount to pay.' },
      { status: 422 },
    );
  }

  // Amount in paise (Razorpay requires integer paise).
  const amountPaise = Math.round(totalOutstanding * 100);

  // Determine the payer role so the webhook can pass it to record_payment.
  const paidByRole = role === 'prop_owner' ? 'Owner' : 'Tenant';

  // Call Razorpay Orders API.
  // Embed bill_ids + association_id + paid_by_role in notes so the async
  // webhook handler can find the bills without a separate DB lookup table.
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
      receipt: billIds[0],
      notes: {
        bill_ids: billIds.join(','),
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
    totalOutstanding,
  });
}
