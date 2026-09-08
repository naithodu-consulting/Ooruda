import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

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

  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();

  // Parallel: user auth + gateway credentials (both keyed on associationId we already have).
  const [
    {
      data: { user },
    },
    { data: gateway },
    { data: assoc },
  ] = await Promise.all([
    client.auth.getUser(),
    admin
      .from('association_payment_gateways')
      .select('key_id, key_secret, is_active')
      .eq('association_id', associationId)
      .maybeSingle(),
    client
      .from('associations')
      .select('account_id')
      .eq('id', associationId)
      .single(),
  ]);

  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!gateway?.is_active) {
    return NextResponse.json(
      { error: 'Online payments are not enabled for this association.' },
      { status: 422 },
    );
  }

  // Parallel: membership check + unit/tenancy lookup.
  const { data: membership } = await client
    .from('accounts_memberships')
    .select('account_role')
    .eq('user_id', user.id)
    .eq('account_id', assoc?.account_id ?? '')
    .maybeSingle();

  if (!membership)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const role = membership.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Parallel: unit IDs + bills (both needed for scoping).
  const [allowedUnitIds, { data: bills }] = await Promise.all([
    role === 'prop_owner'
      ? client
          .from('units')
          .select('id')
          .eq('association_id', associationId)
          .eq('owner_id', user.id)
          .then(({ data }) => (data ?? []).map((u) => u.id))
      : client
          .from('tenancies')
          .select('unit_id')
          .eq('tenant_id', user.id)
          .eq('status', 'active')
          .then(({ data }) => (data ?? []).map((t) => t.unit_id)),
    client
      .from('bills')
      .select('id, total_amount, paid_amount, advance_applied, unit_id')
      .in('id', billIds)
      .eq('association_id', associationId)
      .neq('status', 'Void'),
  ]);

  if (allowedUnitIds.length === 0) {
    return NextResponse.json({ error: 'No units assigned.' }, { status: 403 });
  }

  const allowedBills = (bills ?? []).filter((b) =>
    allowedUnitIds.includes(b.unit_id),
  );
  if (allowedBills.length !== billIds.length) {
    return NextResponse.json(
      { error: 'One or more bills not found.' },
      { status: 404 },
    );
  }

  // advance_applied must be subtracted, or a bill already part-settled by
  // cash-ledger advance credit is charged to the payer twice — and
  // record_payment now rejects the excess, which would capture the money at
  // Razorpay with no payment row written.
  const totalOutstanding = allowedBills.reduce(
    (sum, b) =>
      sum +
      (Number(b.total_amount) -
        Number(b.paid_amount) -
        Number(b.advance_applied ?? 0)),
    0,
  );
  if (totalOutstanding <= 0) {
    return NextResponse.json(
      { error: 'No outstanding amount to pay.' },
      { status: 422 },
    );
  }

  const amountPaise = Math.round(totalOutstanding * 100);
  const paidByRole = role === 'prop_owner' ? 'Owner' : 'Tenant';
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
