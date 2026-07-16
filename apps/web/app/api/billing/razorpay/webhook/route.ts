import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import crypto from 'crypto';

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        amount: number; // total in paise
        notes: {
          bill_ids?: string;
          association_id?: string;
          paid_by_role?: string;
        };
      };
    };
  };
}

/**
 * POST /api/billing/razorpay/webhook
 *
 * Handles async Razorpay webhook events. This is the safety net for cases
 * where the synchronous /verify call never reaches the server (browser closed,
 * network drop, etc.). Razorpay retries on non-2xx responses.
 *
 * Only processes: payment.captured
 * All other events are acknowledged (200) and ignored.
 *
 * Signature verification uses the association's webhook_secret.
 * If not configured, the webhook is rejected (402) to prevent spoofing.
 *
 * Idempotent: the payments_razorpay_bill_uniq index prevents double-recording
 * if both /verify and the webhook fire for the same payment.
 */
export async function POST(req: NextRequest) {
  // Read raw body first — needed for HMAC signature verification.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature header' },
      { status: 400 },
    );
  }

  // Parse payload to extract association context from notes.
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Acknowledge and ignore events we don't handle.
  if (payload.event !== 'payment.captured') {
    return new Response('OK', { status: 200 });
  }

  const paymentEntity = payload.payload.payment.entity;
  const razorpayPaymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;
  const notes = paymentEntity.notes ?? {};
  const associationId = notes.association_id;
  const billIds = notes.bill_ids?.split(',').filter(Boolean) ?? [];
  const paidByRole = notes.paid_by_role ?? 'Owner';

  if (!associationId || billIds.length === 0) {
    // Order was not created by Ooruda (missing notes) — ignore.
    return new Response('OK', { status: 200 });
  }

  const admin = getSupabaseServerAdminClient();

  // Fetch gateway to get the webhook_secret for signature verification.
  const { data: gateway } = await admin
    .from('association_payment_gateways')
    .select('webhook_secret, is_active')
    .eq('association_id', associationId)
    .maybeSingle();

  if (!gateway) {
    return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
  }

  // Gateway was deactivated after the order was created — acknowledge and stop.
  // Return 200 so Razorpay does not retry; the deactivation is intentional.
  if (!gateway.is_active) {
    return new Response('OK', { status: 200 });
  }

  // Reject if webhook_secret is not configured — we cannot verify authenticity.
  if (!gateway.webhook_secret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured for this association' },
      { status: 422 },
    );
  }

  // Verify HMAC-SHA256 signature over the raw request body.
  const expectedSig = crypto
    .createHmac('sha256', gateway.webhook_secret)
    .update(rawBody)
    .digest('hex');

  if (expectedSig !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Fetch bills to get outstanding amounts.
  const { data: bills } = await admin
    .from('bills')
    .select('id, total_amount, paid_amount')
    .in('id', billIds)
    .eq('association_id', associationId);

  if (!bills || bills.length === 0) {
    return NextResponse.json({ error: 'Bills not found' }, { status: 404 });
  }

  const paymentBatchId = billIds.length > 1 ? crypto.randomUUID() : null;

  for (const bill of bills) {
    const outstanding = Number(bill.total_amount) - Number(bill.paid_amount);
    if (outstanding <= 0) continue; // already paid (verify beat the webhook)

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
      // Duplicate: /verify already recorded this payment — skip silently.
      if (error.code === '23505') continue;
      // Any other DB error: return 500 so Razorpay retries.
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return new Response('OK', { status: 200 });
}
