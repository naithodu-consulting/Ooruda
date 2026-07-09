# Ooruda — Backlog & Upcoming Work

Items that are scoped and understood but not yet implemented. Each entry includes enough context to pick up without re-investigating.

---

## Payments

### Register Razorpay Webhook URL

**Priority:** High — without this, failed `/verify` calls mean lost payments (no safety net)  
**Effort:** 5 minutes  
**Depends on:** Association having a public HTTPS URL (Vercel deploy)

1. Go to **Razorpay Dashboard → Settings → Webhooks → Add New Webhook**
2. Set URL to: `https://<your-domain>/api/billing/razorpay/webhook`
3. Select event: **`payment.captured`** (no other events needed)
4. Copy the **Webhook Secret** Razorpay generates
5. Paste it into the association's **Gateway Settings** page (Webhook Secret field) and save

The webhook is rejected if no secret is stored — this is intentional to prevent spoofing. The webhook is fully idempotent: if the synchronous `/verify` already ran, the duplicate DB insert is silently skipped.

**Local testing:** Use `npx localtunnel --port 3000` or `ngrok http 3000` to expose a temporary HTTPS URL, then register that as the webhook URL in Razorpay Dashboard.

---

### Feature: assoc_admin personal bill view + Razorpay self-service

**Priority:** Medium  
**Depends on:** `week-4` branch merged to `main`

An `assoc_admin` who is also a unit owner or tenant currently sees only the full admin view of all association bills. They have no personal "My Bills" view and cannot pay their own bill online via Razorpay — the self-service Pay button is only wired up for `prop_owner` and `tenant` roles.

**What is missing:**
1. Detecting on the payments page that the logged-in `assoc_admin` also has personal bills (is `owner_id` on any unit OR has an active tenancy)
2. Showing them a "My Bills" resident-style view alongside the admin view
3. Wiring the Razorpay Pay button to their personal bills

**Implementation plan**

`apps/web/app/[locale]/home/[account]/payments/page.tsx` — after resolving `role` and `userId`:

```ts
let adminPersonalUnitIds: string[] = [];
if (role === 'assoc_admin' || role === 'billing_operator') {
  const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
    client.from('units').select('id').eq('association_id', association.id).eq('owner_id', userId),
    client.from('tenancies').select('unit_id').eq('tenant_id', userId).eq('status', 'active'),
  ]);
  adminPersonalUnitIds = [
    ...new Set([
      ...(ownedUnits ?? []).map((u) => u.id),
      ...(tenancies ?? []).map((t) => t.unit_id),
    ]),
  ];
}
const hasPersonalBills = adminPersonalUnitIds.length > 0;
```

Then fetch personal bills separately and render a second `PaymentsSection` block above the admin view with `title="My Bills"`, `canManage={false}`, `canPay={true}`.

**Notes:**
- No DB or RLS changes needed
- After merging `week-4`, search for `isUserRestricted` in the payments section and replace with the explicit `canPay` prop pattern

---

### Security Hardening: Encrypt Razorpay credentials using Supabase Vault

**Priority:** High (before onboarding external associations or processing significant volume)  
**Effort:** ~2–3 hours  
**Depends on:** None — self-contained change

Razorpay `key_id`, `key_secret`, and `webhook_secret` are currently stored as plaintext in the `association_payment_gateways` table. The table has no RLS for authenticated users (only `service_role` can access it), and secrets are never sent to the browser — so the current setup is safe for an MVP.

**Step 1 — Enable Vault extension**
```sql
create extension if not exists supabase_vault;
```

**Step 2 — Migrate existing rows** — for each association, move the secrets into Vault and store only the Vault secret ID:
```sql
select vault.create_secret(key_secret, 'razorpay_key_secret_' || association_id::text);
```

**Step 3 — Alter the table**
```sql
alter table public.association_payment_gateways
  add column key_secret_vault_id uuid,
  add column webhook_secret_vault_id uuid;

-- After migrating all rows:
alter table public.association_payment_gateways
  drop column key_secret,
  drop column webhook_secret;
```

**Step 4 — Update server-side reads** (replace plaintext column read with Vault decryption):
```ts
const { data: secretRow } = await admin
  .from('vault.decrypted_secrets')
  .select('decrypted_secret')
  .eq('id', gateway.key_secret_vault_id)
  .single();
const keySecret = secretRow?.decrypted_secret;
```

**Files to update:**
- `apps/web/app/api/billing/razorpay/create-order/route.ts`
- `apps/web/app/api/billing/razorpay/verify/route.ts`
- `apps/web/app/api/billing/razorpay/webhook/route.ts`
- `apps/web/app/[locale]/home/[account]/settings/association/_actions/update-association.ts`
- New migration for schema change; run `pnpm supabase:web:typegen` after

**Notes:**
- Check if Vault is already enabled: `select * from pg_extension where extname = 'supabase_vault'`
- `vault.decrypted_secrets` is accessible only by `service_role` — aligns with existing admin client pattern

---

## Notifications & SMS

### Deploy `send-reminders` Edge Function

**Priority:** High — reminder cron is live on remote but the Edge Function is not yet deployed; cron calls silently fail until this is done  
**Effort:** 5 minutes  
**Status:** Code written (`apps/web/supabase/functions/send-reminders/index.ts`), NOT deployed

```bash
supabase functions deploy send-reminders --project-ref <project-ref>
```

After deploying, verify it appears in Supabase Dashboard → Edge Functions.

**IMPORTANT:** Deploying the function alone will NOT send any SMS. The function exits early if `SMS_PROVIDER` is not set. Configure the secret only when you are ready for customers to receive messages (see SMS Prerequisites below).

---

### Cron Job Configuration (one-time, per environment)

**Priority:** High — reminder SMS will silently fail until this is done  
**Effort:** 15 minutes  
**Status:** Migration `20260709112744_overdue_and_reminder_cron.sql` PUSHED to remote ✓  
**Depends on:** `send-reminders` Edge Function deployed (see above)

The `send-reminders` cron calls the Edge Function via `pg_net` using a project URL and service key stored as DB settings. Run these **once** in Supabase Dashboard → SQL Editor:

```sql
-- Values from Supabase Dashboard → Settings → API
alter database postgres
  set app.supabase_project_url to 'https://<project-ref>.supabase.co';

alter database postgres
  set app.supabase_service_key to '<service_role_key>';
```

Also set these secrets on the Edge Function (Dashboard → Edge Functions → send-reminders → Secrets):
```
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=...
MSG91_SMS_FLOW_ID=...
MSG91_SMS_SENDER_ID=OORUDA
```

**Verify:** Supabase Dashboard → Database → Cron Jobs — you should see `overdue-recompute` and `send-reminders`. Trigger manually: `select public.recompute_overdue_bills();`

---

### SMS Notification Prerequisites (GATE — do not enable until ready)

**Priority:** High — but deliberately NOT done yet. SMS is fully wired in code but will not fire until `SMS_PROVIDER` is set. Do this only when you have tested and are confident customers should receive messages.  
**Effort:** ~1 day (DLT registration takes 2–5 business days — start early)

**Checklist before enabling:**
1. Complete DLT registration first (takes 2–5 days)
2. Smoke-test with `SMS_PROVIDER=mock` locally — confirm server logs show `[SMS MOCK]` output and `notifications_log` has rows
3. Set `SMS_PROVIDER=msg91` (or `2factor`) in Vercel env vars
4. Set the same secret on the Edge Function (Dashboard → Edge Functions → send-reminders → Secrets)
5. Test on a single bill/payment before going fully live

**DLT Registration (mandatory for India)**

TRAI requires all transactional SMS to use pre-approved templates registered on the DLT portal. Register these two templates with your telecom operator (Airtel, Jio, BSNL, etc.):

**Template 1 — Bill Generated:**
```
Your {#var#} bill for Unit {#var#} has been generated. Login to Ooruda to view and pay.
```

**Template 2 — Payment Confirmed:**
```
Payment of {#var#} received for Unit {#var#} via {#var#}. Thank you! - Ooruda
```

**MSG91 setup:**
```bash
MSG91_AUTH_KEY=           # From MSG91 dashboard → API Keys
MSG91_SMS_FLOW_ID=        # Flow with a single {{message}} variable step
MSG91_SMS_SENDER_ID=OORUDA
```
Go to MSG91 → Flows → Create Flow → add SMS step with body `{{message}}` → copy Flow ID.

**2Factor setup:**
```bash
TWOFACTOR_API_KEY=        # From 2factor.in dashboard
```
No flow setup needed — 2Factor's TRANS_SMS API accepts arbitrary text.

**Phone number audit** — run before go-live to check for owners/tenants with no phone number (they'll be silently skipped):
```sql
select p.id, p.full_name, p.mobile_number
from profiles p
join accounts_memberships am on am.user_id = p.id
where p.mobile_number is null;
```

---

## Electricity

### Known gap: sub-meter initial_reading not set at onboarding

**Priority:** Medium  
**Context:** Citadel PRISM sub-meters were imported without `INITIAL_METER_READING` values, so `sub_meters.initial_reading = 0` for all meters. This means the first bill's consumption is calculated as (current reading − 0) instead of (current reading − actual installation reading), producing inflated first-period units.

**Fix:** One-time SQL update with the correct initial readings per meter, confirmed with the association admin. No code change needed.

```sql
UPDATE sub_meters SET initial_reading = <actual_value> WHERE meter_label = '<label>';
```

---
