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
 *   SMS_PROVIDER     — "mock" | "msg91" | "2factor"
 *   MOCK_OTP         — "true" in development (logs OTP, skips SMS send)
 *   MSG91_AUTH_KEY   — required when SMS_PROVIDER=msg91
 *   MSG91_TEMPLATE_ID
 *   TWOFACTOR_API_KEY — required when SMS_PROVIDER=2factor
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
      console.log(`[SMS MOCK] Phone: ${phone}  OTP: ${otp}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (provider === 'msg91') {
      await sendViaMsg91(phone, otp);
    } else if (provider === '2factor' || provider === 'twofactor') {
      await sendViaTwoFactor(phone, otp);
    } else {
      throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[custom-sms-hook] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

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
