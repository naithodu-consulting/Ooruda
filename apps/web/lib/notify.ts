import 'server-only';
import { getSmsProvider } from '@kit/sms';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

/**
 * Send SMS notifications when bills are generated for a batch of units.
 * Looks up the owner + active tenant for each billed unit in one batch query,
 * then fires notifications in parallel. Never throws — individual send failures
 * are logged to notifications_log but don't block the billing action.
 */
export async function sendBillGeneratedNotifications(
  associationId: string,
  billedUnitIds: string[],
  monthLabel: string,
): Promise<void> {
  if (billedUnitIds.length === 0) return;

  const admin = getSupabaseServerAdminClient();
  const sms = getSmsProvider();

  // Batch fetch owners and active tenancies for all billed units.
  const [{ data: units }, { data: tenancies }] = await Promise.all([
    admin.from('units').select('id, unit_no, owner_id').in('id', billedUnitIds),
    admin
      .from('tenancies')
      .select('unit_id, tenant_id, units!inner(unit_no)')
      .in('unit_id', billedUnitIds)
      .eq('status', 'active'),
  ]);

  // Build recipient list: { userId, unitNo }
  type Recipient = { userId: string; unitNo: string };
  const recipients: Recipient[] = [];

  for (const u of units ?? []) {
    if (u.owner_id) {
      recipients.push({ userId: u.owner_id, unitNo: u.unit_no });
    }
  }
  for (const t of tenancies ?? []) {
    const unitNo = (t.units as { unit_no: string } | null)?.unit_no ?? '';
    recipients.push({ userId: t.tenant_id, unitNo });
  }

  if (recipients.length === 0) return;

  // Batch fetch phone numbers — profiles RLS is own-only, admin client needed.
  const userIds = [...new Set(recipients.map((r) => r.userId))];
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, mobile_number')
    .in('id', userIds);

  const phoneByUser = new Map(
    (profiles ?? [])
      .filter((p) => p.mobile_number)
      .map((p) => [p.id, p.mobile_number!]),
  );

  await Promise.allSettled(
    recipients.map(async ({ userId, unitNo }) => {
      const phone = phoneByUser.get(userId);
      if (!phone) return;

      const message = `Your ${monthLabel} bill for Unit ${unitNo} has been generated. Login to Ooruda to view and pay.`;
      const result = await sms.sendSms(phone, message);

      await admin.from('notifications_log').insert({
        association_id: associationId,
        type: 'bill_generated',
        recipient_user_id: userId,
        channel: 'sms',
        provider_key: process.env.SMS_PROVIDER ?? 'mock',
        status: result.success ? 'Sent' : 'Failed',
        provider_ref: result.messageId ?? null,
      });
    }),
  );
}

/**
 * Send an SMS confirmation after a payment is recorded (manual or Razorpay).
 * `recipientUserId` — the user who made / should receive the confirmation.
 * Never throws.
 */
export async function sendPaymentConfirmedNotification(params: {
  associationId: string;
  recipientUserId: string;
  unitNo: string;
  amount: number;
  mode: string;
}): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const sms = getSmsProvider();

  const { data: profile } = await admin
    .from('profiles')
    .select('mobile_number')
    .eq('id', params.recipientUserId)
    .maybeSingle();

  const phone = profile?.mobile_number;
  if (!phone) return;

  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(params.amount);

  const message = `Payment of ${formattedAmount} received for Unit ${params.unitNo} via ${params.mode}. Thank you! — Ooruda`;
  const result = await sms.sendSms(phone, message);

  await admin.from('notifications_log').insert({
    association_id: params.associationId,
    type: 'payment_confirmed',
    recipient_user_id: params.recipientUserId,
    channel: 'sms',
    provider_key: process.env.SMS_PROVIDER ?? 'mock',
    status: result.success ? 'Sent' : 'Failed',
    provider_ref: result.messageId ?? null,
  });
}
