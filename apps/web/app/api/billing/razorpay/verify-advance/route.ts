import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';

import crypto from 'crypto';

export const POST = enhanceRouteHandler(
  async function ({ request, user }) {
    const body = (await request.json()) as {
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
      amount < 1
    ) {
      return NextResponse.json(
        { error: 'Invalid request body' },
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
        { error: 'Association not found.' },
        { status: 404 },
      );
    }

    const [
      { data: membership },
      [{ data: ownerUnit }, { data: tenancy }],
      { data: gateway },
    ] = await Promise.all([
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
      // association_payment_gateways has no RLS for regular users — admin client required.
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
        { error: 'Online payments are not enabled.' },
        { status: 422 },
      );
    }

    // HMAC verification — ensures the payment was initiated through our order
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

    // Idempotency pre-check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingEntry } = await (admin as any)
      .from('cash_ledger')
      .select('id')
      .eq('razorpay_payment_id', razorpayPaymentId)
      .maybeSingle();

    if (existingEntry) {
      return NextResponse.json({
        ledgerId: null,
        alreadyRecorded: true,
      });
    }

    // Fetch actual captured amount from Razorpay — never trust the client-supplied amount
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

    // Resolve payer name and tenancy for the ledger entry
    const paidByRole = role === 'prop_owner' ? 'Owner' : 'Tenant';
    const tenancyId = role === 'tenant' ? (tenancy?.id ?? null) : null;

    const { data: profile } = await client
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const paidByName =
      (profile as { full_name: string | null } | null)?.full_name ??
      user.email ??
      paidByRole;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (admin as any).rpc(
      'record_advance_payment',
      {
        p_association_id: associationId,
        p_unit_id: unitId,
        p_bill_type: billType,
        p_amount: verifiedAmount,
        p_paid_by_name: paidByName,
        p_paid_by_role: paidByRole,
        p_tenancy_id: tenancyId,
        p_razorpay_order_id: razorpayOrderId,
        p_razorpay_payment_id: razorpayPaymentId,
      },
    );

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ ledgerId: null, alreadyRecorded: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ledgerId = (result as { id: string; already_recorded: boolean })?.id;

    void logAuditEvent({
      associationId,
      action: 'razorpay.advance_payment.confirmed',
      entityType: 'payment',
      summary: `Advance deposit confirmed via Razorpay: ₹${verifiedAmount} for ${billType} on unit`,
      metadata: {
        razorpayPaymentId: razorpayPaymentId,
        ledgerId,
        unitId,
        billType,
        amount: verifiedAmount,
        paidByRole,
      },
      useAdminClient: true,
    });

    return NextResponse.json({ ledgerId });
  },
  { auth: true },
);
