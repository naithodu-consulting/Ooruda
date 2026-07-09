/**
 * send-reminders — Supabase Edge Function
 *
 * Called daily at 9 AM IST (03:30 UTC) by pg_cron via pg_net.
 *
 * For each association:
 *   1. Read reminder_schedule_json: { days_before: number[], days_after: number[] }
 *   2. Find Unpaid/Partial bills where today matches a reminder day
 *   3. Notify the unit owner + active tenant via SMS
 *   4. Log each attempt to notifications_log
 *
 * Environment variables (set in Supabase Edge Function secrets):
 *   SUPABASE_URL            — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 *   SMS_PROVIDER            — "mock" | "msg91" | "2factor"
 *   MSG91_AUTH_KEY / MSG91_SMS_FLOW_ID / MSG91_SMS_SENDER_ID
 *   TWOFACTOR_API_KEY
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    await processReminders();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-reminders] fatal error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

async function processReminders() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Fetch all associations' reminder schedules.
  const { data: settings, error: settingsErr } = await admin
    .from('billing_settings')
    .select('association_id, reminder_schedule_json');

  if (settingsErr) throw settingsErr;
  if (!settings?.length) return;

  for (const setting of settings) {
    const schedule = setting.reminder_schedule_json as {
      days_before: number[];
      days_after: number[];
    };
    const daysBefore: number[] = schedule?.days_before ?? [3, 1];
    const daysAfter: number[] = schedule?.days_after ?? [1, 7];

    // Build the set of due_dates that should trigger a reminder today.
    // days_before: bill due in N days → due_date = today + N
    // days_after:  bill overdue by N days → due_date = today - N
    const targetDueDates = [
      ...daysBefore.map((n) => addDays(today, n)),
      ...daysAfter.map((n) => addDays(today, -n)),
    ];

    if (targetDueDates.length === 0) continue;

    // Find bills for this association that match any target due_date.
    const { data: bills, error: billsErr } = await admin
      .from('bills')
      .select(
        'id, bill_no, due_date, total_amount, paid_amount, units!inner(id, unit_no, owner_id)',
      )
      .eq('association_id', setting.association_id)
      .in('status', ['Unpaid', 'Partial', 'Overdue'])
      .in(
        'due_date',
        targetDueDates.map((d) => d.toISOString().slice(0, 10)),
      );

    if (billsErr) {
      console.error('[send-reminders] bills query error:', billsErr);
      continue;
    }
    if (!bills?.length) continue;

    // Collect unit IDs to fetch active tenants in one query.
    const unitIds = [
      ...new Set(bills.map((b) => (b.units as { id: string }).id)),
    ];

    const { data: tenancies } = await admin
      .from('tenancies')
      .select('unit_id, tenant_id')
      .in('unit_id', unitIds)
      .eq('status', 'active');

    const tenantByUnit = new Map(
      (tenancies ?? []).map((t) => [t.unit_id, t.tenant_id]),
    );

    // Collect all user IDs to fetch phones in one query.
    const recipientPairs: { userId: string; bill: (typeof bills)[0] }[] = [];
    for (const bill of bills) {
      const unit = bill.units as {
        id: string;
        unit_no: string;
        owner_id: string | null;
      };
      if (unit.owner_id) recipientPairs.push({ userId: unit.owner_id, bill });
      const tenantId = tenantByUnit.get(unit.id);
      if (tenantId) recipientPairs.push({ userId: tenantId, bill });
    }

    if (!recipientPairs.length) continue;

    const userIds = [...new Set(recipientPairs.map((r) => r.userId))];
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, mobile_number')
      .in('id', userIds);

    const phoneByUser = new Map(
      (profiles ?? [])
        .filter((p) => p.mobile_number)
        .map((p) => [p.id, p.mobile_number as string]),
    );

    // Send notifications.
    await Promise.allSettled(
      recipientPairs.map(async ({ userId, bill }) => {
        const phone = phoneByUser.get(userId);
        if (!phone) return;

        const unit = bill.units as { unit_no: string };
        const outstanding =
          Number(bill.total_amount) - Number(bill.paid_amount);
        const dueDate = bill.due_date as string;
        const isPastDue = new Date(dueDate) < today;

        const message = isPastDue
          ? `Reminder: Your bill for Unit ${unit.unit_no} is overdue (due ${dueDate}). Outstanding: ₹${Math.round(outstanding).toLocaleString('en-IN')}. Login to Ooruda to pay.`
          : `Reminder: Your bill for Unit ${unit.unit_no} is due on ${dueDate}. Amount: ₹${Math.round(outstanding).toLocaleString('en-IN')}. Login to Ooruda to pay.`;

        const result = await sendSms(phone, message);

        await admin.from('notifications_log').insert({
          association_id: setting.association_id,
          type: isPastDue ? 'overdue_reminder' : 'due_date_reminder',
          recipient_user_id: userId,
          channel: 'sms',
          provider_key: Deno.env.get('SMS_PROVIDER') ?? 'mock',
          status: result.success ? 'Sent' : 'Failed',
          provider_ref: result.messageId ?? null,
        });
      }),
    );
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── SMS helpers ─────────────────────────────────────────────────────────────

async function sendSms(
  phone: string,
  message: string,
): Promise<{ success: boolean; messageId?: string }> {
  const provider = (Deno.env.get('SMS_PROVIDER') ?? 'mock').toLowerCase();

  if (provider === 'mock') {
    console.log(`[SMS MOCK] To: ${phone} | ${message}`);
    return {
      success: true,
      messageId: `mock-${crypto.randomUUID().slice(0, 8)}`,
    };
  }

  if (provider === 'msg91') return sendViaMSG91(phone, message);
  if (provider === '2factor' || provider === 'twofactor')
    return sendViaTwoFactor(phone, message);

  console.warn(`[send-reminders] Unknown SMS_PROVIDER: ${provider}`);
  return { success: false };
}

async function sendViaMSG91(
  phone: string,
  message: string,
): Promise<{ success: boolean; messageId?: string }> {
  const authKey = Deno.env.get('MSG91_AUTH_KEY') ?? '';
  const flowId = Deno.env.get('MSG91_SMS_FLOW_ID') ?? '';
  const senderId = Deno.env.get('MSG91_SMS_SENDER_ID') ?? 'OORUDA';

  if (!authKey || !flowId) {
    console.error('[send-reminders] MSG91 not configured');
    return { success: false };
  }

  let cleaned = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) cleaned = phone.slice(1).replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;

  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify({
      flow_id: flowId,
      sender: senderId,
      recipients: [{ mobiles: cleaned, message }],
    }),
  });

  const data = (await res.json()) as {
    type?: string;
    request_id?: string;
    message?: string;
  };
  if (res.ok && data.type === 'success') {
    return { success: true, messageId: data.request_id };
  }
  console.error('[send-reminders] MSG91 error:', data.message);
  return { success: false };
}

async function sendViaTwoFactor(
  phone: string,
  message: string,
): Promise<{ success: boolean; messageId?: string }> {
  const apiKey = Deno.env.get('TWOFACTOR_API_KEY') ?? '';
  if (!apiKey) {
    console.error('[send-reminders] TWOFACTOR_API_KEY not set');
    return { success: false };
  }

  const cleaned = phone.replace(/\D/g, '');
  const url = `https://2factor.in/API/V1/${apiKey}/TRANS_SMS/${cleaned}/${encodeURIComponent(message)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { Status?: string; Details?: string };

  if (res.ok && data.Status === 'Success') {
    return { success: true, messageId: data.Details };
  }
  console.error('[send-reminders] 2Factor error:', data.Details);
  return { success: false };
}
