import 'server-only';
import {
  renderBillDispatchEmail,
  renderReceiptDispatchEmail,
} from '@kit/email-templates';
import { getSmsProvider } from '@kit/sms';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

const SENDER_EMAIL = process.env.EMAIL_SENDER ?? 'hello@ooruda.com';

// ── Channel enablement ────────────────────────────────────────────────────────
// Reads notification_providers_config for platform defaults (association_id IS NULL).
// Cached in-process for 5 minutes to avoid a DB hit on every notification call.

let _channelCache: Map<string, boolean> | null = null;
let _channelCacheAt = 0;
const CHANNEL_TTL_MS = 5 * 60 * 1000;

async function getEnabledChannels(): Promise<{ sms: boolean; email: boolean }> {
  if (process.env.NEXT_PUBLIC_ENABLE_SMS_EMAIL_NOTIFICATIONS !== 'true') {
    const { getLogger } = await import('@kit/shared/logger');
    const logger = await getLogger();
    logger.info(
      '[notify] SMS/Email notifications disabled — NEXT_PUBLIC_ENABLE_SMS_EMAIL_NOTIFICATIONS is not set or false',
    );
    return { sms: false, email: false };
  }

  const now = Date.now();
  if (_channelCache && now - _channelCacheAt < CHANNEL_TTL_MS) {
    return {
      sms: _channelCache.get('SMS') ?? false,
      email: _channelCache.get('Email') ?? false,
    };
  }

  const client = getSupabaseServerAdminClient();
  const { data } = await client
    .from('notification_providers_config')
    .select('channel, is_active')
    .is('association_id', null);

  _channelCache = new Map((data ?? []).map((r) => [r.channel, r.is_active]));
  _channelCacheAt = now;
  return {
    sms: _channelCache.get('SMS') ?? false,
    email: _channelCache.get('Email') ?? false,
  };
}

/** Force-clear the channel cache (call after admin updates notification settings). */
export function invalidateChannelCache() {
  _channelCache = null;
  _channelCacheAt = 0;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)
    return { success: false, error: 'RESEND_API_KEY not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: SENDER_EMAIL, to: [to], subject, html }),
  });

  if (res.ok) {
    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  }
  return { success: false, error: `Resend HTTP ${res.status}` };
}

async function logNotification(params: {
  associationId: string;
  type: string;
  recipientUserId: string | null;
  channel: string;
  providerKey: string;
  status: 'Sent' | 'Failed' | 'Pending';
  providerRef?: string | null;
}) {
  const client = getSupabaseServerAdminClient();
  await client.from('notifications_log').insert({
    association_id: params.associationId,
    type: params.type,
    recipient_user_id: params.recipientUserId,
    channel: params.channel,
    provider_key: params.providerKey,
    status: params.status,
    provider_ref: params.providerRef ?? null,
  });
}

// Inserts into Makerkit's notifications table, which powers the bell icon.
// account_id = auth user id (personal account id = auth user id in Makerkit).
async function createInAppNotification(params: {
  userId: string;
  title: string;
  body: string;
  linkTo?: string;
  type?: 'info' | 'warning' | 'error';
}) {
  const client = getSupabaseServerAdminClient();
  const fullBody = params.title
    ? `**${params.title}**\n${params.body}`
    : params.body;
  await client.from('notifications').insert({
    account_id: params.userId,
    type: params.type ?? 'info',
    body: fullBody.slice(0, 500),
    link: params.linkTo ?? null,
    channel: 'in_app',
  });
}

// Fetch mobile numbers for a list of user IDs from profiles
async function getMobileNumbers(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const client = getSupabaseServerAdminClient();
  const { data } = await client
    .from('profiles')
    .select('id, mobile_number')
    .in('id', userIds);
  return new Map(
    (data ?? [])
      .filter((p) => p.mobile_number)
      .map((p) => [p.id, p.mobile_number!]),
  );
}

// Fetch email addresses for a list of user IDs from auth.users via admin client
async function getEmailAddresses(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const client = getSupabaseServerAdminClient();
  const results = await Promise.all(
    userIds.map((uid) => client.auth.admin.getUserById(uid)),
  );
  return new Map(
    results
      .map((r, i) => [userIds[i]!, r.data.user?.email ?? ''] as const)
      .filter(([, email]) => email),
  );
}

// Fetch full name from profiles
async function getFullName(userId: string): Promise<string> {
  const client = getSupabaseServerAdminClient();
  const { data } = await client
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();
  return data?.full_name ?? 'Resident';
}

// ── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function ordinalDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = d!;
  const v = day % 100;
  const suffix =
    v >= 11 && v <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return `${day}${suffix} ${MONTHS[m! - 1]} ${y}`;
}

function formatPeriod(periodStr: string): string {
  const [y, m] = periodStr.split('-').map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BillGeneratedParams {
  associationId: string;
  associationName: string;
  accountSlug: string;
  billedUnits: Array<{
    unitId: string;
    unitNo: string;
    ownerUserId: string | null;
    activeTenantUserId: string | null;
    billNo: string;
    billType: string;
    period: string;
    totalAmount: number;
    dueDate: string;
  }>;
}

/**
 * Send bill-generated SMS + email to owners and active tenants for each billed unit.
 * Best-effort: never throws.
 */
export async function sendBillGeneratedNotifications(
  params: BillGeneratedParams,
): Promise<void> {
  try {
    const { sms: smsEnabled, email: emailEnabled } = await getEnabledChannels();
    if (!smsEnabled && !emailEnabled) return;

    const smsProvider = getSmsProvider();

    for (const unit of params.billedUnits) {
      const recipientIds = [unit.ownerUserId, unit.activeTenantUserId].filter(
        Boolean,
      ) as string[];

      if (recipientIds.length === 0) continue;

      const [mobiles, emails] = await Promise.all([
        smsEnabled
          ? getMobileNumbers(recipientIds)
          : Promise.resolve(new Map<string, string>()),
        emailEnabled
          ? getEmailAddresses(recipientIds)
          : Promise.resolve(new Map<string, string>()),
      ]);

      for (const userId of recipientIds) {
        const billLink = `/home/${params.accountSlug}`;
        const notifTitle = `Bill Generated for Unit ${unit.unitNo}`;
        const notifBody = `Your ${formatPeriod(unit.period)} bill of ₹${unit.totalAmount.toLocaleString('en-IN')} is ready. Due ${ordinalDate(unit.dueDate)}.`;

        // In-app notification (always)
        await createInAppNotification({
          userId,
          title: notifTitle,
          body: notifBody,
          linkTo: billLink,
        }).catch(() => null);

        // SMS
        if (smsEnabled) {
          const phone = mobiles.get(userId);
          if (phone) {
            const result = await smsProvider.sendSms(phone, 'bill_generated', {
              unit_no: unit.unitNo,
              period: unit.period,
              amount: unit.totalAmount.toLocaleString('en-IN'),
              due_date: unit.dueDate,
            });
            await logNotification({
              associationId: params.associationId,
              type: 'bill_generated',
              recipientUserId: userId,
              channel: 'SMS',
              providerKey: process.env.SMS_PROVIDER ?? 'mock',
              status: result.success ? 'Sent' : 'Failed',
              providerRef: result.messageId ?? null,
            }).catch(() => null);
          }
        }

        // Email
        if (emailEnabled) {
          const email = emails.get(userId);
          const name = await getFullName(userId).catch(() => 'Resident');
          if (email) {
            const { html, subject } = await renderBillDispatchEmail({
              ownerName: name,
              unitNo: unit.unitNo,
              billNo: unit.billNo,
              billType: unit.billType,
              period: unit.period,
              totalAmount: unit.totalAmount,
              dueDate: unit.dueDate,
              associationName: params.associationName,
            });
            const result = await sendEmail(email, subject, html);
            await logNotification({
              associationId: params.associationId,
              type: 'bill_generated',
              recipientUserId: userId,
              channel: 'Email',
              providerKey: 'resend',
              status: result.success ? 'Sent' : 'Failed',
              providerRef: result.messageId ?? null,
            }).catch(() => null);
          }
        }
      }
    }
  } catch (err) {
    const { getLogger } = await import('@kit/shared/logger');
    const logger = await getLogger();
    logger.error({ err }, 'sendBillGeneratedNotifications failed');
  }
}

export interface PaymentConfirmedParams {
  associationId: string;
  associationName: string;
  accountSlug: string;
  recipientUserId: string;
  unitNo: string;
  billNo: string;
  billType: string;
  period: string;
  paidAmount: number;
}

/**
 * Send payment-confirmed SMS + email to the payer.
 * Best-effort: never throws.
 */
export async function sendPaymentConfirmedNotification(
  params: PaymentConfirmedParams,
): Promise<void> {
  try {
    const { sms: smsEnabled, email: emailEnabled } = await getEnabledChannels();
    if (!smsEnabled && !emailEnabled) return;

    const smsProvider = getSmsProvider();
    const amountStr = `₹${params.paidAmount.toLocaleString('en-IN')}`;
    const notifTitle = `Payment Received for Unit ${params.unitNo}`;
    const notifBody = `${amountStr} received for your ${formatPeriod(params.period)} bill. Thank you!`;
    const statementLink = `/home/${params.accountSlug}/statement`;

    // In-app notification (always)
    await createInAppNotification({
      userId: params.recipientUserId,
      title: notifTitle,
      body: notifBody,
      linkTo: statementLink,
    }).catch(() => null);

    const [mobiles, emails] = await Promise.all([
      smsEnabled
        ? getMobileNumbers([params.recipientUserId])
        : Promise.resolve(new Map<string, string>()),
      emailEnabled
        ? getEmailAddresses([params.recipientUserId])
        : Promise.resolve(new Map<string, string>()),
    ]);

    // SMS
    if (smsEnabled) {
      const phone = mobiles.get(params.recipientUserId);
      if (phone) {
        const result = await smsProvider.sendSms(phone, 'payment_confirmed', {
          unit_no: params.unitNo,
          amount: amountStr,
          period: params.period,
        });
        await logNotification({
          associationId: params.associationId,
          type: 'payment_confirmed',
          recipientUserId: params.recipientUserId,
          channel: 'SMS',
          providerKey: process.env.SMS_PROVIDER ?? 'mock',
          status: result.success ? 'Sent' : 'Failed',
          providerRef: result.messageId ?? null,
        }).catch(() => null);
      }
    }

    // Email
    if (emailEnabled) {
      const email = emails.get(params.recipientUserId);
      const name = await getFullName(params.recipientUserId).catch(
        () => 'Resident',
      );
      if (email) {
        const { html, subject } = await renderReceiptDispatchEmail({
          ownerName: name,
          unitNo: params.unitNo,
          billNo: params.billNo,
          billType: params.billType,
          period: params.period,
          paidAmount: params.paidAmount,
          associationName: params.associationName,
        });
        const result = await sendEmail(email, subject, html);
        await logNotification({
          associationId: params.associationId,
          type: 'payment_confirmed',
          recipientUserId: params.recipientUserId,
          channel: 'Email',
          providerKey: 'resend',
          status: result.success ? 'Sent' : 'Failed',
          providerRef: result.messageId ?? null,
        }).catch(() => null);
      }
    }
  } catch (err) {
    const { getLogger } = await import('@kit/shared/logger');
    const logger = await getLogger();
    logger.error({ err }, 'sendPaymentConfirmedNotification failed');
  }
}

export interface ReminderParams {
  associationId: string;
  associationName: string;
  accountSlug: string;
  recipientUserId: string;
  unitNo: string;
  billNo: string;
  billType: string;
  period: string;
  outstandingAmount: number;
  dueDate: string;
  isOverdue: boolean;
}

/**
 * Send a due-date reminder or overdue SMS + email notification.
 * Called from the send-reminders Edge Function — best-effort, never throws.
 */
export async function sendReminderNotification(
  params: ReminderParams,
): Promise<void> {
  try {
    const { sms: smsEnabled, email: emailEnabled } = await getEnabledChannels();
    if (!smsEnabled && !emailEnabled) return;

    const smsProvider = getSmsProvider();
    const amountStr = `₹${params.outstandingAmount.toLocaleString('en-IN')}`;
    const templateKey = params.isOverdue ? 'overdue' : 'reminder';
    const notifTitle = params.isOverdue
      ? `Overdue Bill for Unit ${params.unitNo}`
      : `Bill Reminder for Unit ${params.unitNo}`;
    const notifBody = params.isOverdue
      ? `Your ${formatPeriod(params.period)} bill of ${amountStr} was due ${ordinalDate(params.dueDate)}. Pay now to avoid late fees.`
      : `Your ${formatPeriod(params.period)} bill of ${amountStr} is due ${ordinalDate(params.dueDate)}.`;
    const billLink = `/home/${params.accountSlug}`;

    await createInAppNotification({
      userId: params.recipientUserId,
      title: notifTitle,
      body: notifBody,
      linkTo: billLink,
      type: params.isOverdue ? 'warning' : 'info',
    }).catch(() => null);

    const [mobiles, emails] = await Promise.all([
      smsEnabled
        ? getMobileNumbers([params.recipientUserId])
        : Promise.resolve(new Map<string, string>()),
      emailEnabled
        ? getEmailAddresses([params.recipientUserId])
        : Promise.resolve(new Map<string, string>()),
    ]);

    if (smsEnabled) {
      const phone = mobiles.get(params.recipientUserId);
      if (phone) {
        const result = await smsProvider.sendSms(phone, templateKey, {
          unit_no: params.unitNo,
          amount: amountStr,
          due_date: params.dueDate,
          period: params.period,
        });
        await logNotification({
          associationId: params.associationId,
          type: templateKey,
          recipientUserId: params.recipientUserId,
          channel: 'SMS',
          providerKey: process.env.SMS_PROVIDER ?? 'mock',
          status: result.success ? 'Sent' : 'Failed',
          providerRef: result.messageId ?? null,
        }).catch(() => null);
      }
    }

    if (emailEnabled) {
      const email = emails.get(params.recipientUserId);
      const name = await getFullName(params.recipientUserId).catch(
        () => 'Resident',
      );
      if (email) {
        // Uses the reminder email template (built in task 5)
        const { renderBillReminderEmail } =
          await import('@kit/email-templates');
        const { html, subject } = await renderBillReminderEmail({
          recipientName: name,
          unitNo: params.unitNo,
          billNo: params.billNo,
          billType: params.billType,
          period: params.period,
          outstandingAmount: params.outstandingAmount,
          dueDate: params.dueDate,
          isOverdue: params.isOverdue,
          associationName: params.associationName,
          accountSlug: params.accountSlug,
        });
        const result = await sendEmail(email, subject, html);
        await logNotification({
          associationId: params.associationId,
          type: templateKey,
          recipientUserId: params.recipientUserId,
          channel: 'Email',
          providerKey: 'resend',
          status: result.success ? 'Sent' : 'Failed',
          providerRef: result.messageId ?? null,
        }).catch(() => null);
      }
    }
  } catch (err) {
    const { getLogger } = await import('@kit/shared/logger');
    const logger = await getLogger();
    logger.error({ err }, 'sendReminderNotification failed');
  }
}
