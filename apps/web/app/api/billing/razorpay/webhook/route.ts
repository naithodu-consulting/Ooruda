import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { logAuditEvent } from '~/lib/audit-log';

import crypto from 'crypto';

interface PaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  notes: {
    bill_ids?: string;
    association_id?: string;
    paid_by_role?: string;
    is_due?: string;
    type?: string;
    unit_id?: string;
    bill_type?: string;
  };
}

interface RefundEntity {
  id: string;
  payment_id: string;
  amount: number;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity: PaymentEntity };
    refund?: { entity: RefundEntity };
  };
}

/**
 * POST /api/billing/razorpay/webhook
 *
 * Handles async Razorpay webhook events. This is the safety net for cases
 * where the synchronous /verify call never reaches the server (browser closed,
 * network drop, etc.). Razorpay retries on non-2xx responses.
 *
 * Handled events:
 *   payment.captured - record the payment against the bill / cash-ledger due
 *   refund.processed - mark the payment as reversed; bill reverts to unpaid
 *
 * All other events are acknowledged (200) and ignored.
 *
 * Signature verification uses the association's webhook_secret.
 * If not configured, the webhook is rejected (422) to prevent spoofing.
 *
 * Idempotent: the payments_razorpay_bill_uniq index prevents double-recording
 * if both /verify and the webhook fire for the same payment.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature header' },
      { status: 400 },
    );
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event } = payload;

  if (event !== 'payment.captured' && event !== 'refund.processed') {
    return new Response('OK', { status: 200 });
  }

  const admin = getSupabaseServerAdminClient();

  // ── refund.processed ──────────────────────────────────────────────────────
  if (event === 'refund.processed') {
    const refundEntity = payload.payload.refund?.entity;
    if (!refundEntity?.payment_id) {
      return NextResponse.json(
        { error: 'Missing refund payment_id in payload' },
        { status: 400 },
      );
    }

    const razorpayPaymentId = refundEntity.payment_id;

    // Look up the association via the original payment record so we can
    // verify the webhook signature before mutating anything.
    const { data: existingPayment } = await admin
      .from('payments')
      .select('association_id')
      .eq('razorpay_payment_id', razorpayPaymentId)
      .maybeSingle();

    // Also check cash_ledger_payments if not found in standard payments.
    let associationId: string | null = existingPayment?.association_id ?? null;
    if (!associationId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: clp } = await (admin as any)
        .from('cash_ledger_payments')
        .select('association_id')
        .eq('razorpay_payment_id', razorpayPaymentId)
        .maybeSingle();
      associationId = clp?.association_id ?? null;
    }

    if (!associationId) {
      // Payment not from Ooruda - ignore silently.
      return new Response('OK', { status: 200 });
    }

    const { data: gateway } = await admin
      .from('association_payment_gateways')
      .select('webhook_secret, is_active')
      .eq('association_id', associationId)
      .maybeSingle();

    if (!gateway?.webhook_secret) {
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 422 },
      );
    }

    const expectedSig = crypto
      .createHmac('sha256', gateway.webhook_secret)
      .update(rawBody)
      .digest('hex');

    // Return 200 on bad signature - same as the "not found" path - so
    // unauthenticated callers cannot distinguish a valid payment_id from an
    // unknown one (information oracle eliminated).
    // Use timingSafeEqual to prevent HMAC timing attacks.
    const signaturesMatch =
      expectedSig.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSig, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    if (!signaturesMatch) {
      return new Response('OK', { status: 200 });
    }

    // Convert paise → rupees. Pass the exact refunded amount so partial
    // refunds reduce paid_amount without fully reversing the payment.
    const refundAmountRupees = refundEntity.amount / 100;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc('record_payment_reversal', {
      p_razorpay_payment_id: razorpayPaymentId,
      p_refund_amount: refundAmountRupees,
    });

    if (error) {
      void logAuditEvent({
        action: 'razorpay.refund.failed',
        entityType: 'payment',
        eventType: 'error',
        summary: `Razorpay refund webhook RPC failed: ${error.message}`,
        metadata: { razorpayPaymentId },
        useAdminClient: true,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    void logAuditEvent({
      action: 'razorpay.refund.processed',
      entityType: 'payment',
      summary: `Razorpay refund processed for payment ${razorpayPaymentId}`,
      metadata: { razorpayPaymentId, refundAmount: refundEntity.amount / 100 },
      useAdminClient: true,
    });

    return new Response('OK', { status: 200 });
  }

  // ── payment.captured ──────────────────────────────────────────────────────
  const paymentEntity = payload.payload.payment?.entity;
  if (!paymentEntity) {
    return NextResponse.json(
      { error: 'Missing payment entity in payload' },
      { status: 400 },
    );
  }

  const razorpayPaymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;
  const notes = paymentEntity.notes ?? {};
  const associationId = notes.association_id;
  const billIds = notes.bill_ids?.split(',').filter(Boolean) ?? [];
  const VALID_PAID_BY_ROLES = ['Owner', 'Tenant'] as const;
  const rawPaidByRole = notes.paid_by_role ?? 'Owner';
  const paidByRole: string = (
    VALID_PAID_BY_ROLES as readonly string[]
  ).includes(rawPaidByRole)
    ? rawPaidByRole
    : 'Owner';
  const isDue = notes.is_due === 'true';
  const isAdvance = notes.type === 'advance';
  const dueUnitId = notes.unit_id;
  const dueBillType = notes.bill_type;

  if (!associationId || (billIds.length === 0 && !isDue && !isAdvance)) {
    return new Response('OK', { status: 200 });
  }

  const { data: gateway } = await admin
    .from('association_payment_gateways')
    .select('webhook_secret, is_active')
    .eq('association_id', associationId)
    .maybeSingle();

  if (!gateway) {
    return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
  }

  if (!gateway.is_active) {
    return new Response('OK', { status: 200 });
  }

  if (!gateway.webhook_secret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured for this association' },
      { status: 422 },
    );
  }

  const expectedSig = crypto
    .createHmac('sha256', gateway.webhook_secret)
    .update(rawBody)
    .digest('hex');

  const signaturesMatch =
    expectedSig.length === signature.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  if (!signaturesMatch) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (isDue) {
    if (!dueUnitId || !dueBillType) {
      return NextResponse.json(
        { error: 'Missing unit_id or bill_type in due payment notes' },
        { status: 400 },
      );
    }

    // Validate unit_id from notes belongs to the association - the HMAC only
    // authenticates the association, not which unit was embedded in the notes.
    const { data: unitCheck } = await admin
      .from('units')
      .select('id')
      .eq('id', dueUnitId)
      .eq('association_id', associationId)
      .maybeSingle();

    if (!unitCheck) {
      return NextResponse.json(
        { error: 'Unit not found in association' },
        { status: 400 },
      );
    }

    const amountRupees = paymentEntity.amount / 100;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc('record_due_payment_webhook', {
      p_association_id: associationId,
      p_unit_id: dueUnitId,
      p_bill_type: dueBillType,
      p_amount: amountRupees,
      p_razorpay_payment_id: razorpayPaymentId,
    });

    if (error) {
      if (error.code === '23505') return new Response('OK', { status: 200 });
      void logAuditEvent({
        associationId,
        action: 'razorpay.due_payment.failed',
        entityType: 'payment',
        eventType: 'error',
        summary: `Razorpay due-payment webhook failed: ${error.message}`,
        metadata: { razorpayPaymentId, dueUnitId, dueBillType },
        useAdminClient: true,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    void logAuditEvent({
      associationId,
      action: 'razorpay.payment.captured',
      entityType: 'payment',
      summary: `Razorpay due-payment captured via webhook`,
      metadata: { razorpayPaymentId, dueUnitId, dueBillType },
      useAdminClient: true,
    });

    return new Response('OK', { status: 200 });
  }

  if (isAdvance) {
    if (!dueUnitId || !dueBillType) {
      return NextResponse.json(
        { error: 'Missing unit_id or bill_type in advance payment notes' },
        { status: 400 },
      );
    }

    const { data: unitCheck } = await admin
      .from('units')
      .select('id')
      .eq('id', dueUnitId)
      .eq('association_id', associationId)
      .maybeSingle();

    if (!unitCheck) {
      return NextResponse.json(
        { error: 'Unit not found in association' },
        { status: 400 },
      );
    }

    const amountRupees = paymentEntity.amount / 100;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc('record_advance_payment', {
      p_association_id: associationId,
      p_unit_id: dueUnitId,
      p_bill_type: dueBillType,
      p_amount: amountRupees,
      p_paid_by_name: null,
      p_paid_by_role: paidByRole,
      p_tenancy_id: null,
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
    });

    if (error) {
      if (error.code === '23505') return new Response('OK', { status: 200 });
      void logAuditEvent({
        associationId,
        action: 'razorpay.advance_payment.failed',
        entityType: 'payment',
        eventType: 'error',
        summary: `Razorpay advance-payment webhook failed: ${error.message}`,
        metadata: { razorpayPaymentId, dueUnitId, dueBillType },
        useAdminClient: true,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    void logAuditEvent({
      associationId,
      action: 'razorpay.advance_payment.captured',
      entityType: 'payment',
      summary: `Razorpay advance-payment captured via webhook`,
      metadata: { razorpayPaymentId, dueUnitId, dueBillType },
      useAdminClient: true,
    });

    return new Response('OK', { status: 200 });
  }

  const { data: bills } = await admin
    .from('bills')
    .select('id, total_amount, paid_amount, advance_applied')
    .in('id', billIds)
    .eq('association_id', associationId)
    .neq('status', 'Void');

  if (!bills || bills.length === 0) {
    // Bills are missing or all voided. Return 200 so Razorpay stops retrying -
    // a non-2xx response would cause up to 15 retries over 24 hours while the
    // money sits unconciled. Log so the admin can issue a manual refund.
    void logAuditEvent({
      associationId,
      action: 'razorpay.payment.void_bill',
      entityType: 'payment',
      eventType: 'error',
      summary: `Razorpay webhook payment arrived for voided or missing bill(s), not recorded. Manual refund may be required.`,
      metadata: { razorpayPaymentId, razorpayOrderId, billIds },
      useAdminClient: true,
    });
    return new Response('OK', { status: 200 });
  }

  const paymentBatchId = billIds.length > 1 ? crypto.randomUUID() : null;

  for (const bill of bills) {
    // Must match record_payment's own check, or the RPC rejects the amount
    // after Razorpay has already captured it.
    const outstanding =
      Number(bill.total_amount) -
      Number(bill.paid_amount) -
      Number(bill.advance_applied ?? 0);
    if (outstanding <= 0) continue;

    const { error } = await admin.rpc('record_payment', {
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
      if (error.code === '23505') continue;
      void logAuditEvent({
        associationId,
        action: 'razorpay.payment.failed',
        entityType: 'payment',
        eventType: 'error',
        summary: `Razorpay webhook payment recording failed for bill ${bill.id}: ${error.message}`,
        metadata: { razorpayPaymentId, razorpayOrderId, billId: bill.id },
        useAdminClient: true,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  void logAuditEvent({
    associationId,
    action: 'razorpay.payment.captured',
    entityType: 'payment',
    summary: `Razorpay payment captured via webhook (${billIds.length} bill${billIds.length === 1 ? '' : 's'})`,
    metadata: { razorpayPaymentId, razorpayOrderId, billCount: billIds.length },
    useAdminClient: true,
  });

  return new Response('OK', { status: 200 });
}
