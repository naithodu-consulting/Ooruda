import { NextRequest, NextResponse } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import crypto from 'crypto';

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

  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();

  // Parallel: user auth + gateway + association.
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
      .select('key_secret, is_active')
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

  // Parallel: membership + unit/tenancy scoping.
  // The scope query uses the body-supplied paidByRole for routing — this is
  // safe because we cross-check it against the verified membership role below.
  const [{ data: membership }, { data: scopeRows }] = await Promise.all([
    client
      .from('accounts_memberships')
      .select('account_role')
      .eq('user_id', user.id)
      .eq('account_id', assoc?.account_id ?? '')
      .maybeSingle(),
    paidByRole === 'Owner'
      ? client
          .from('units')
          .select('id')
          .eq('association_id', associationId)
          .eq('owner_id', user.id)
      : client
          .from('tenancies')
          .select('unit_id')
          .eq('tenant_id', user.id)
          .eq('status', 'active'),
  ]);

  if (!membership)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const role = membership.account_role;
  if (role !== 'prop_owner' && role !== 'tenant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Derive canonical label from verified membership — reject if body was tampered.
  // This prevents a prop_owner from sending paidByRole:'Tenant' to mislabel the payment.
  const canonicalPaidByRole = role === 'prop_owner' ? 'Owner' : 'Tenant';
  if (paidByRole !== canonicalPaidByRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const allowedUnitIds = (scopeRows ?? []).map((r) =>
    'id' in r ? r.id : (r as { unit_id: string }).unit_id,
  );
  if (allowedUnitIds.length === 0) {
    return NextResponse.json({ error: 'No units assigned.' }, { status: 403 });
  }

  // Verify HMAC-SHA256 signature.
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

  // Fetch bills scoped to the caller's units. Exclude voided bills — a
  // payment should never be recorded against a cancelled bill.
  const { data: bills } = await client
    .from('bills')
    .select('id, total_amount, paid_amount')
    .in('id', billIds)
    .in('unit_id', allowedUnitIds)
    .eq('association_id', associationId)
    .neq('status', 'Void');

  if (!bills || bills.length === 0) {
    // Race window: bill was voided after the Razorpay order was created but
    // before payment was completed. Log for admin visibility — Razorpay has
    // captured the money and a manual refund from the dashboard may be needed.
    const logger = await getLogger();
    logger.warn(
      { razorpayOrderId, razorpayPaymentId, billIds, associationId },
      'Razorpay verify: bills not found or all voided after payment captured — manual refund may be required',
    );
    return NextResponse.json(
      {
        error:
          'One or more bills have been cancelled. Please contact your association admin — your payment will be reviewed.',
      },
      { status: 422 },
    );
  }

  const paymentBatchId = billIds.length > 1 ? crypto.randomUUID() : null;

  // Record payments in parallel.
  const results = await Promise.all(
    bills
      .filter((b) => Number(b.total_amount) - Number(b.paid_amount) > 0)
      .map((bill) =>
        client.rpc('record_payment', {
          p_bill_id: bill.id,
          p_association_id: associationId,
          p_amount: Number(bill.total_amount) - Number(bill.paid_amount),
          p_mode: 'Razorpay',
          p_paid_by_role: canonicalPaidByRole,
          p_razorpay_payment_id: razorpayPaymentId,
          p_razorpay_order_id: razorpayOrderId,
          p_payment_batch_id: paymentBatchId,
        }),
      ),
  );

  const paymentIds: string[] = [];
  for (const { data: paymentId, error } of results) {
    if (error) {
      if (error.code === '23505') continue; // duplicate — skip
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (paymentId) paymentIds.push(paymentId as string);
  }

  return NextResponse.json({ paymentIds });
}
