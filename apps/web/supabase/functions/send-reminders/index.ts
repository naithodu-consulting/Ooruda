// Edge Function: send-reminders
// Triggered daily at 9 AM IST by pg_cron via pg_net HTTP POST.
// For each association, reads billing_settings.reminder_schedule_json,
// finds bills matching the due-date offsets, and sends SMS + email to
// owners and active tenants. Logs every attempt to notifications_log
// and creates in_app_notifications for the bell icon.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SENDER_EMAIL = 'hello@ooruda.com';
const APP_URL = Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? 'https://ooruda.com';
const SMS_PROVIDER = (Deno.env.get('SMS_PROVIDER') ?? 'mock').toLowerCase();

// ── SMS sending (Deno-compatible, no Node imports) ───────────────────────────

interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendSms(
  phone: string,
  templateKey: string,
  variables: Record<string, string>,
): Promise<SmsResponse> {
  if (SMS_PROVIDER === 'mock') {
    console.log(`[SMS MOCK] phone=${phone} template=${templateKey}`, variables);
    return {
      success: true,
      messageId: `mock-${Math.random().toString(36).slice(2, 9)}`,
    };
  }

  if (SMS_PROVIDER === 'kaleyra') {
    const apiKey = Deno.env.get('KALEYRA_API_KEY') ?? '';
    const sid = Deno.env.get('KALEYRA_SID') ?? '';
    const senderId = Deno.env.get('KALEYRA_SENDER_ID') ?? 'OORUDA';
    const region = (Deno.env.get('KALEYRA_REGION') ?? 'IN').toUpperCase();
    const regionHosts: Record<string, string> = {
      IN: 'api.in.kaleyra.io',
      SG: 'api.kaleyra.io',
      EU: 'api.eu.kaleyra.io',
      NA: 'api.na.kaleyra.io',
    };
    const templateEnvMap: Record<string, string> = {
      reminder: 'KALEYRA_SMS_TEMPLATE_REMINDER',
      overdue: 'KALEYRA_SMS_TEMPLATE_OVERDUE',
    };
    const templateId = Deno.env.get(templateEnvMap[templateKey] ?? '') ?? '';
    if (!apiKey || !sid || !templateId) {
      return {
        success: false,
        error: `Kaleyra config missing for template '${templateKey}'`,
      };
    }
    const host = regionHosts[region] ?? regionHosts['IN']!;
    const normalized = `+${phone.replace(/\D/g, '')}`;
    const body = new URLSearchParams({
      to: normalized,
      type: 'TXN',
      sender: senderId,
      template_id: templateId,
      template_data: JSON.stringify(variables),
    });
    const res = await fetch(`https://${host}/v1/${sid}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'api-key': apiKey,
      },
      body: body.toString(),
    });
    const data = (await res.json()) as {
      data?: { id?: string } | null;
      error?: string | { message?: string };
    };
    if (res.ok && data.data)
      return { success: true, messageId: data.data.id ?? 'kaleyra-ok' };
    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : (data.error?.message ?? `Kaleyra failed ${res.status}`);
    return { success: false, error: errMsg };
  }

  if (SMS_PROVIDER === 'msg91') {
    const authKey = Deno.env.get('MSG91_AUTH_KEY') ?? '';
    const flowId = Deno.env.get('MSG91_FLOW_ID') ?? '';
    const senderId = Deno.env.get('MSG91_SENDER_ID') ?? 'OORUDA';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '91' + cleaned;
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        flow_id: flowId,
        sender: senderId,
        recipients: [{ mobiles: cleaned, ...variables }],
      }),
    });
    const data = (await res.json()) as {
      type?: string;
      request_id?: string;
      message?: string;
    };
    if (res.ok && data.type === 'success')
      return { success: true, messageId: data.request_id };
    return { success: false, error: data.message ?? 'MSG91 send failed' };
  }

  return { success: false, error: `Unsupported SMS_PROVIDER: ${SMS_PROVIDER}` };
}

// ── Email sending ─────────────────────────────────────────────────────────────

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SmsResponse> {
  if (!RESEND_API_KEY)
    return { success: false, error: 'RESEND_API_KEY not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: SENDER_EMAIL, to: [to], subject, html }),
  });
  if (res.ok) {
    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  }
  return { success: false, error: `Resend HTTP ${res.status}` };
}

// Minimal reminder email HTML (no react-email in Deno — plain inline HTML)
function buildReminderEmailHtml(params: {
  recipientName: string;
  unitNo: string;
  period: string;
  billType: string;
  outstandingAmount: number;
  dueDate: string;
  isOverdue: boolean;
  associationName: string;
  accountSlug: string;
}): { html: string; subject: string } {
  const amountStr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(params.outstandingAmount);
  const accentColor = params.isOverdue ? '#dc2626' : '#d97706';
  const headingText = params.isOverdue
    ? 'Overdue Bill – Action Required'
    : `Payment Reminder`;
  const bodyText = params.isOverdue
    ? `Your ${params.billType} bill for ${params.period} (Unit ${params.unitNo}) is past its due date. Please clear ${amountStr} immediately.`
    : `Friendly reminder: Your ${params.billType} bill for ${params.period} (Unit ${params.unitNo}) of ${amountStr} is due on ${params.dueDate}.`;

  const subject = params.isOverdue
    ? `Action Required: Overdue ${params.billType} Bill – ${params.associationName}`
    : `Reminder: ${params.billType} Bill Due ${params.dueDate} – ${params.associationName}`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f8f5ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px">
<tr><td style="background:#1a1a1a;padding:24px 32px">
  <span style="color:#fff;font-size:20px;font-weight:700">Ooruda</span>
</td></tr>
<tr><td style="padding:32px">
  <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a">${headingText}</h2>
  <p style="margin:0 0 24px;font-size:15px;color:#4a4a4a">Dear ${params.recipientName},</p>
  <p style="margin:0 0 24px;font-size:15px;color:#4a4a4a">${bodyText}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${params.isOverdue ? '#fef2f2' : '#fffbeb'};border:1px solid ${accentColor};border-radius:8px;margin:0 0 24px">
    <tr><td align="center" style="padding:20px">
      <div style="font-size:13px;color:${accentColor};font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${params.isOverdue ? 'Overdue Amount' : 'Amount Due'}</div>
      <div style="font-size:32px;font-weight:700;color:${accentColor}">${amountStr}</div>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ede9df">
    <tr><td style="padding:11px 0;font-size:13px;color:#6b6b5e;width:42%">Unit</td><td style="padding:11px 0;font-size:13px;color:#2d2d2d">${params.unitNo}</td></tr>
    <tr><td style="padding:11px 0;font-size:13px;color:#6b6b5e;border-top:1px solid #ede9df">Period</td><td style="padding:11px 0;font-size:13px;color:#2d2d2d;border-top:1px solid #ede9df">${params.period}</td></tr>
    <tr><td style="padding:11px 0;font-size:13px;color:#6b6b5e;border-top:1px solid #ede9df">Due Date</td><td style="padding:11px 0;font-size:${params.isOverdue ? '15px;font-weight:600' : '13px'};color:${params.isOverdue ? accentColor : '#2d2d2d'};border-top:1px solid #ede9df">${params.dueDate}</td></tr>
  </table>
  <div style="text-align:center;margin:24px 0">
    <a href="${APP_URL}/home/${params.accountSlug}/billing" style="display:inline-block;background:${accentColor};color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;padding:12px 28px">${params.isOverdue ? 'Pay Now' : 'View & Pay Bill'}</a>
  </div>
  <p style="font-size:13px;color:#9b9b8e;margin:16px 0 0">If you have already made the payment, please ignore this message.</p>
</td></tr>
<tr><td style="background:#f8f5ee;padding:16px 32px;text-align:center;font-size:12px;color:#9b9b8e">${params.associationName}</td></tr>
</table></td></tr></table></body></html>`;

  return { html, subject };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check which channels are enabled (platform defaults, association_id IS NULL)
    const { data: channelConfigs } = await supabase
      .from('notification_providers_config')
      .select('channel, is_active')
      .is('association_id', null);

    const enabledChannels = new Map(
      (channelConfigs ?? []).map(
        (r: { channel: string; is_active: boolean }) => [
          r.channel,
          r.is_active,
        ],
      ),
    );
    const smsEnabled = enabledChannels.get('SMS') ?? false;
    const emailEnabled = enabledChannels.get('Email') ?? false;

    if (!smsEnabled && !emailEnabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'all channels disabled' }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const today = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    );
    today.setHours(0, 0, 0, 0);

    // Fetch all associations with their reminder schedules
    const { data: associations } = await supabase
      .from('associations')
      .select('id, name, accounts!inner(slug)')
      .eq('is_active', true);

    if (!associations?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: allSettings } = await supabase
      .from('billing_settings')
      .select('association_id, reminder_schedule_json')
      .in(
        'association_id',
        associations.map((a: { id: string }) => a.id),
      );

    const settingsMap = new Map(
      (allSettings ?? []).map(
        (s: { association_id: string; reminder_schedule_json: unknown }) => [
          s.association_id,
          s.reminder_schedule_json as {
            days_before?: number[];
            days_after?: number[];
          } | null,
        ],
      ),
    );

    let totalSent = 0;
    let totalFailed = 0;

    for (const assoc of associations as {
      id: string;
      name: string;
      accounts: { slug: string };
    }[]) {
      const schedule = settingsMap.get(assoc.id) ?? {
        days_before: [3, 1],
        days_after: [1, 7],
      };
      const daysBefore = schedule?.days_before ?? [3, 1];
      const daysAfter = schedule?.days_after ?? [1, 7];

      // Compute target due dates
      const targetDates: { date: string; isOverdue: boolean }[] = [];
      for (const d of daysBefore) {
        const dt = new Date(today);
        dt.setDate(dt.getDate() + d);
        targetDates.push({
          date: dt.toISOString().slice(0, 10),
          isOverdue: false,
        });
      }
      for (const d of daysAfter) {
        const dt = new Date(today);
        dt.setDate(dt.getDate() - d);
        targetDates.push({
          date: dt.toISOString().slice(0, 10),
          isOverdue: true,
        });
      }

      if (!targetDates.length) continue;

      const { data: bills } = await supabase
        .from('bills')
        .select(`
          id, bill_no, bill_type, period, total_amount, paid_amount, advance_applied, due_date,
          units!inner(id, unit_no, owner_id),
          tenancies(tenant_id, status)
        `)
        .eq('association_id', assoc.id)
        .in('status', ['Unpaid', 'Partial', 'Overdue'])
        .in(
          'due_date',
          targetDates.map((t) => t.date),
        );

      if (!bills?.length) continue;

      for (const bill of bills as {
        id: string;
        bill_no: string;
        bill_type: string;
        period: string;
        total_amount: number;
        paid_amount: number;
        advance_applied: number;
        due_date: string;
        units:
          | { id: string; unit_no: string; owner_id: string }
          | { id: string; unit_no: string; owner_id: string }[];
        tenancies: { tenant_id: string; status: string }[];
      }[]) {
        const unit = Array.isArray(bill.units) ? bill.units[0] : bill.units;
        if (!unit) continue;

        const outstanding = Math.max(
          0,
          bill.total_amount - bill.paid_amount - (bill.advance_applied ?? 0),
        );
        const targetEntry = targetDates.find((t) => t.date === bill.due_date);
        const isOverdue = targetEntry?.isOverdue ?? false;

        const activeTenancy = (bill.tenancies ?? []).find(
          (t) => t.status === 'active',
        );
        const recipientIds = [unit.owner_id, activeTenancy?.tenant_id].filter(
          Boolean,
        ) as string[];

        // Fetch profiles for phone + full_name
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, mobile_number, full_name')
          .in('id', recipientIds);

        const profileMap = new Map(
          (profiles ?? []).map(
            (p: {
              id: string;
              mobile_number: string | null;
              full_name: string | null;
            }) => [p.id, p],
          ),
        );

        // Fetch emails from auth.users — parallel to avoid N+1
        const emailResults = await Promise.all(
          recipientIds.map((uid) => supabase.auth.admin.getUserById(uid)),
        );
        const emailMap = new Map<string, string>(
          emailResults
            .map(
              (r, i) => [recipientIds[i]!, r.data.user?.email ?? ''] as const,
            )
            .filter(([, email]) => email),
        );

        for (const userId of recipientIds) {
          const profile = profileMap.get(userId);
          const recipientName = profile?.full_name ?? 'Resident';

          // In-app bell notification via Makerkit notifications table
          const notifTitle = isOverdue
            ? `Overdue Bill — Unit ${unit.unit_no}`
            : `Bill Reminder — Unit ${unit.unit_no}`;
          const notifBody = isOverdue
            ? `Your ${bill.period} bill of ₹${outstanding.toLocaleString('en-IN')} is overdue (due ${bill.due_date}). Pay now.`
            : `Reminder: Your ${bill.period} bill of ₹${outstanding.toLocaleString('en-IN')} is due on ${bill.due_date}.`;
          await supabase
            .from('notifications')
            .insert({
              account_id: userId,
              type: isOverdue ? 'warning' : 'info',
              body: `**${notifTitle}**\n${notifBody}`.slice(0, 500),
              link: `/home/${assoc.accounts.slug}/billing`,
              channel: 'in_app',
            })
            .catch(() => null);

          // SMS
          if (smsEnabled && profile?.mobile_number) {
            const result = await sendSms(
              profile.mobile_number,
              isOverdue ? 'overdue' : 'reminder',
              {
                unit_no: unit.unit_no,
                amount: `₹${outstanding.toLocaleString('en-IN')}`,
                due_date: bill.due_date,
                period: bill.period,
              },
            );
            await supabase
              .from('notifications_log')
              .insert({
                association_id: assoc.id,
                type: isOverdue ? 'overdue' : 'reminder',
                recipient_user_id: userId,
                channel: 'SMS',
                provider_key: SMS_PROVIDER,
                status: result.success ? 'Sent' : 'Failed',
                provider_ref: result.messageId ?? null,
              })
              .catch(() => null);
            if (result.success) totalSent++;
            else totalFailed++;
          }

          // Email
          if (emailEnabled && emailMap.get(userId)) {
            const email = emailMap.get(userId)!;
            const { html, subject } = buildReminderEmailHtml({
              recipientName,
              unitNo: unit.unit_no,
              period: bill.period,
              billType: bill.bill_type,
              outstandingAmount: outstanding,
              dueDate: bill.due_date,
              isOverdue,
              associationName: assoc.name,
              accountSlug: assoc.accounts.slug,
            });
            const result = await sendEmail(email, subject, html);
            await supabase
              .from('notifications_log')
              .insert({
                association_id: assoc.id,
                type: isOverdue ? 'overdue' : 'reminder',
                recipient_user_id: userId,
                channel: 'Email',
                provider_key: 'resend',
                status: result.success ? 'Sent' : 'Failed',
                provider_ref: result.messageId ?? null,
              })
              .catch(() => null);
            if (result.success) totalSent++;
            else totalFailed++;
          }
        }
      }
    }

    // Log the cron run to audit_logs as a system event
    await supabase
      .from('audit_logs')
      .insert({
        association_id: null,
        actor_user_id: null,
        action: 'reminders.cron.completed',
        entity_type: 'system',
        summary: `Reminder cron: ${totalSent} sent, ${totalFailed} failed`,
        event_type: 'system_event',
      })
      .catch(() => null);

    return new Response(
      JSON.stringify({ sent: totalSent, failed: totalFailed }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('send-reminders fatal error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
