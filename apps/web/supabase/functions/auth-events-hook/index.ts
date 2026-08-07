// Edge Function: auth-events-hook
// Registered as a Supabase Auth Webhook (Dashboard → Auth → Hooks → "Auth Events").
// Fires on every auth event and writes a row to audit_logs for activity tracking.
//
// Setup (Supabase Dashboard):
//   Auth → Hooks → Auth Events → HTTP Request
//   URL: https://<project-ref>.supabase.co/functions/v1/auth-events-hook
//   Secret: set HOOK_SECRET env var and configure the same in the dashboard

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Optional: verify HMAC signature from Supabase auth webhook
const HOOK_SECRET = Deno.env.get('AUTH_HOOK_SECRET') ?? '';

// Auth event type → human-readable action
const EVENT_ACTION_MAP: Record<string, string> = {
  'user.created': 'auth.user.created',
  login: 'auth.login',
  logout: 'auth.logout',
  password_recovery: 'auth.password_recovery',
  token_refreshed: 'auth.token_refreshed',
  user_modified: 'auth.user.modified',
  user_deleted: 'auth.user.deleted',
  mfa_challenge: 'auth.mfa.challenge',
  mfa_verify: 'auth.mfa.verify',
  signup: 'auth.signup',
  invite: 'auth.invite',
  otp: 'auth.otp',
  phone_change: 'auth.phone_change',
  email_change: 'auth.email_change',
  reauthentication: 'auth.reauthentication',
};

interface AuthWebhookPayload {
  type: string;
  event: string;
  session?: {
    user?: { id?: string; email?: string; phone?: string };
    ip_address?: string;
    user_agent?: string;
  };
  user?: { id?: string; email?: string; phone?: string };
  ip_address?: string;
  user_agent?: string;
}

Deno.serve(async (req) => {
  // Verify the request is from Supabase auth (HMAC-SHA256 signature check)
  if (!HOOK_SECRET) {
    return new Response('AUTH_HOOK_SECRET not configured', { status: 500 });
  }

  const signature = req.headers.get('x-supabase-signature') ?? '';
  const body = await req.text();

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(HOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signatureBytes = hexToBytes(signature.replace('sha256=', ''));
  const bodyBytes = new TextEncoder().encode(body);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    bodyBytes,
  );

  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = JSON.parse(body) as AuthWebhookPayload;
  await processEvent(payload);

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function processEvent(payload: AuthWebhookPayload) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const eventKey = payload.event ?? payload.type ?? 'unknown';
  const action = EVENT_ACTION_MAP[eventKey] ?? `auth.${eventKey}`;

  const userId = payload.session?.user?.id ?? payload.user?.id ?? null;
  const ipAddress = payload.session?.ip_address ?? payload.ip_address ?? null;
  const userAgent = payload.session?.user_agent ?? payload.user_agent ?? null;
  const email = payload.session?.user?.email ?? payload.user?.email;

  const summary = buildSummary(eventKey, email);

  await supabase.from('audit_logs').insert({
    association_id: null, // auth events are platform-level
    actor_user_id: userId,
    action,
    entity_type: 'user',
    entity_id: userId,
    summary,
    event_type: 'auth_event',
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata: {
      auth_event: eventKey,
      email: email ? maskEmail(email) : null,
    },
  });
}

function buildSummary(eventKey: string, email?: string): string {
  const masked = email ? maskEmail(email) : 'unknown';
  switch (eventKey) {
    case 'login':
      return `User ${masked} signed in`;
    case 'logout':
      return `User ${masked} signed out`;
    case 'signup':
      return `New user signed up: ${masked}`;
    case 'user.created':
      return `User account created: ${masked}`;
    case 'password_recovery':
      return `Password recovery initiated for ${masked}`;
    case 'token_refreshed':
      return `Token refreshed for ${masked}`;
    case 'mfa_challenge':
      return `MFA challenge issued for ${masked}`;
    case 'mfa_verify':
      return `MFA verified for ${masked}`;
    case 'otp':
      return `OTP sent to ${masked}`;
    default:
      return `Auth event '${eventKey}' for ${masked}`;
  }
}

// Mask email to preserve privacy in logs: john.doe@example.com → j***@example.com
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
