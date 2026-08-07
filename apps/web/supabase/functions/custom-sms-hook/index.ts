/**
 * Supabase Auth Hook — Custom SMS Provider
 *
 * Supabase calls this Edge Function instead of its built-in Twilio integration.
 * Wired in: Supabase Dashboard → Authentication → Hooks → Send SMS hook.
 *
 * Payload shape (from Supabase docs):
 *   { user: { phone }, sms: { otp } }
 *
 * Environment variables (set in Supabase Edge Function secrets):
 *   SMS_PROVIDER     — "mock" | "kaleyra" | "msg91" | "2factor"
 *   MOCK_OTP         — "true" in development (logs OTP, skips SMS send)
 *
 *   Kaleyra (SMS_PROVIDER=kaleyra):
 *   KALEYRA_API_KEY              — API key from Kaleyra dashboard
 *   KALEYRA_SID                  — Account SID (e.g. AXIN1871893356IN)
 *   KALEYRA_SENDER_ID            — Registered sender/alphanumeric ID (e.g. ABCSOL)
 *   KALEYRA_SMS_TEMPLATE_ID      — DLT template ID (required for India)
 *   KALEYRA_REGION               — "IN" | "SG" | "EU" | "NA"  (default: IN)
 *   KALEYRA_CHANNEL              — "sms" | "whatsapp"  (default: sms)
 *   KALEYRA_WA_FROM              — WhatsApp sender number (when KALEYRA_CHANNEL=whatsapp)
 *   KALEYRA_WA_TEMPLATE_NAME     — Approved WA template name (when KALEYRA_CHANNEL=whatsapp)
 *   KALEYRA_WA_TEMPLATE_LANG     — Template language code (default: en)
 *   KALEYRA_WA_HAS_COPY_BUTTON   — "true" if template has a copy-code button component
 *
 *   MSG91 (SMS_PROVIDER=msg91):
 *   MSG91_AUTH_KEY, MSG91_TEMPLATE_ID
 *
 *   2Factor (SMS_PROVIDER=2factor):
 *   TWOFACTOR_API_KEY, TWOFACTOR_TEMPLATE_NAME
 *
 * NOTE: Kaleyra send logic is duplicated from packages/sms/src/providers/kaleyra.ts
 * (Deno cannot import Node packages). Keep both in sync.
 */

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
    const payload = (await req.json()) as {
      user: { phone: string };
      sms: { otp: string };
    };

    const phone = payload.user.phone;
    const otp = payload.sms.otp;

    const provider = (Deno.env.get('SMS_PROVIDER') ?? 'mock').toLowerCase();
    const isMock = Deno.env.get('MOCK_OTP') === 'true' || provider === 'mock';

    if (isMock) {
      console.log(`[SMS MOCK] Phone: ${phone}  OTP: [redacted]`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (provider === 'kaleyra') {
      await sendViaKaleyra(phone, otp);
    } else if (provider === 'msg91') {
      await sendViaMsg91(phone, otp);
    } else if (provider === '2factor' || provider === 'twofactor') {
      await sendViaTwoFactor(phone, otp);
    } else {
      // Config error — return 200 so Supabase Auth does not retry indefinitely
      console.error(`[custom-sms-hook] Unknown SMS_PROVIDER: ${provider}`);
      return new Response(
        JSON.stringify({ error: `Unknown SMS_PROVIDER: ${provider}` }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[custom-sms-hook] error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

// Region → API host mapping per Kaleyra docs
const KALEYRA_REGION_HOSTS: Record<string, string> = {
  IN: 'api.in.kaleyra.io',
  SG: 'api.kaleyra.io',
  EU: 'api.eu.kaleyra.io',
  NA: 'api.na.kaleyra.io',
};

// Supabase always stores phone in E.164 (+91XXXXXXXXXX). Always emit + prefix.
function normalizePhone(phone: string): string {
  return `+${phone.replace(/\D/g, '')}`;
}

async function sendViaKaleyra(phone: string, otp: string) {
  const apiKey = Deno.env.get('KALEYRA_API_KEY') ?? '';
  const sid = Deno.env.get('KALEYRA_SID') ?? '';
  if (!apiKey || !sid)
    throw new Error('KALEYRA_API_KEY or KALEYRA_SID missing');

  const region = (Deno.env.get('KALEYRA_REGION') ?? 'IN').toUpperCase();
  const channel = (Deno.env.get('KALEYRA_CHANNEL') ?? 'sms').toLowerCase();
  const host = KALEYRA_REGION_HOSTS[region] ?? KALEYRA_REGION_HOSTS['IN'];
  const to = normalizePhone(phone);

  if (channel === 'whatsapp') {
    const waFrom = Deno.env.get('KALEYRA_WA_FROM') ?? '';
    const templateName = Deno.env.get('KALEYRA_WA_TEMPLATE_NAME') ?? '';
    const templateLang = Deno.env.get('KALEYRA_WA_TEMPLATE_LANG') ?? 'en';
    const hasCopyButton = Deno.env.get('KALEYRA_WA_HAS_COPY_BUTTON') === 'true';
    if (!waFrom || !templateName) {
      throw new Error('KALEYRA_WA_FROM or KALEYRA_WA_TEMPLATE_NAME missing');
    }

    const components: object[] = [
      { type: 'body', parameters: [{ type: 'text', text: otp }] },
    ];
    if (hasCopyButton) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: otp }],
      });
    }

    const url = `https://${host}/v2/${sid}/whatsapp/messages`;
    const payload = {
      to,
      from: waFrom,
      channel: 'whatsapp',
      content: {
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components,
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      data?: { id?: string; message_id?: string } | null;
      error?: { message?: string } | string;
    };
    if (!res.ok || !data.data) {
      const msg =
        typeof data.error === 'string'
          ? data.error
          : (data.error?.message ?? `Kaleyra WhatsApp failed (${res.status})`);
      throw new Error(msg);
    }
  } else {
    const senderId = Deno.env.get('KALEYRA_SENDER_ID') ?? 'KLRHXA';
    const templateId = Deno.env.get('KALEYRA_SMS_TEMPLATE_ID') ?? '';

    const url = `https://${host}/v1/${sid}/messages`;
    const body = new URLSearchParams({ to, type: 'OTP', sender: senderId });
    if (templateId) {
      // Use template_id + template_data — Kaleyra substitutes {#num#} server-side.
      body.set('template_id', templateId);
      body.set('template_data', JSON.stringify({ num: otp }));
    } else {
      body.set(
        'body',
        `${otp} is your login verification code for Ooruda. Do not share it with anyone. Valid for 10 minutes.`,
      );
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'api-key': apiKey,
      },
      body: body.toString(),
    });
    const data = (await res.json()) as {
      data?: { id?: string; message_id?: string } | null;
      error?: { message?: string } | string;
    };
    if (!res.ok || !data.data) {
      const msg =
        typeof data.error === 'string'
          ? data.error
          : (data.error?.message ?? `Kaleyra SMS failed (${res.status})`);
      throw new Error(msg);
    }
  }
}

async function sendViaMsg91(phone: string, otp: string) {
  const authKey = Deno.env.get('MSG91_AUTH_KEY') ?? '';
  const templateId = Deno.env.get('MSG91_TEMPLATE_ID') ?? '';
  if (!authKey || !templateId)
    throw new Error('MSG91_AUTH_KEY or MSG91_TEMPLATE_ID missing');

  // Remove + and ensure country code prefix
  let cleaned = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) cleaned = phone.slice(1).replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;

  const res = await fetch(
    `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${cleaned}&otp=${otp}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
    },
  );
  const data = (await res.json()) as {
    type?: string;
    Status?: string;
    message?: string;
  };
  if (!res.ok || (data.type !== 'success' && data.Status !== 'Success')) {
    throw new Error(data.message ?? 'MSG91 send failed');
  }
}

async function sendViaTwoFactor(phone: string, otp: string) {
  const apiKey = Deno.env.get('TWOFACTOR_API_KEY') ?? '';
  const templateName = Deno.env.get('TWOFACTOR_TEMPLATE_NAME') ?? '';
  if (!apiKey) throw new Error('TWOFACTOR_API_KEY missing');

  const cleaned = phone.replace(/\D/g, '');
  const url = templateName
    ? `https://2factor.in/API/V1/${apiKey}/SMS/${cleaned}/${otp}/${templateName}`
    : `https://2factor.in/API/V1/${apiKey}/SMS/${cleaned}/${otp}`;

  const res = await fetch(url);
  const data = (await res.json()) as { Status?: string; Details?: string };
  if (!res.ok || data.Status !== 'Success') {
    throw new Error(data.Details ?? '2Factor send failed');
  }
}
