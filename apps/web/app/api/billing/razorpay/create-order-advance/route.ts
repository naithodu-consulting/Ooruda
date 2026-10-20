import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export const POST = enhanceRouteHandler(
  async function ({ request, user }) {
    const body = (await request.json()) as {
      associationId: string;
      unitId: string;
      billType: string;
      amount: number;
    };

    const { associationId, unitId, billType, amount } = body;

    if (!associationId || !unitId || !billType || !amount || amount < 1) {
      return NextResponse.json(
        { error: 'Invalid request body. Minimum advance amount is ₹1.' },
        { status: 400 },
      );
    }

    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

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

    const [{ data: membership }, unitAllowedResult, { data: gateway }] =
      await Promise.all([
        client
          .from('accounts_memberships')
          .select('account_role')
          .eq('user_id', user.id)
          .eq('account_id', assoc.account_id)
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
        // association_payment_gateways has no RLS for regular users - admin client required.
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
        receipt: `adv-${unitId.slice(0, 8)}`,
        notes: {
          type: 'advance',
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
  },
  { auth: true },
);
