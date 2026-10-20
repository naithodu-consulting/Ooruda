# Ooruda - Backlog & Upcoming Work

Items that are scoped and understood but not yet implemented. Each entry includes enough context to pick up without re-investigating.

---

## Dev DB sync - pending steps (do before next release push)

**Priority:** High - must complete before pushing v1.4 to dev/staging  
**Linked Supabase project:** `bcdosjrbkkemsqowhigj` (dev)

### Step 1 - Push pending migrations

4 migrations are not yet on dev. Run:

```bash
cd apps/web && supabase migration list --linked   # verify these 4 show blank remote column
./scripts/db-push.sh
```

Pending migrations:
| Migration | Purpose |
|---|---|
| `20260805000002_missing_fk_indexes.sql` | FK index performance |
| `20260806000001_activity_tracking_and_notifications.sql` | audit_logs enhancements, notification schema |
| `20260806000002_reminder_cron.sql` | pg_cron schedule for `send-reminders` Edge Function |
| `20260806000003_drop_in_app_notifications.sql` | Drop legacy in-app notification tables |

### Step 2 - Register auth-events-hook in Supabase Dashboard

⚠️ **Blocked - Supabase free/pro plan limitation.**  
The Auth Hooks page only exposes: Send Email hook, JWT Claims hook, Before User Created hook. A generic post-auth-event webhook (needed to log login/logout/OTP to `audit_logs`) requires **Team or Enterprise plan**. The `auth-events-hook` Edge Function is deployed and ready - registration is blocked by plan tier.

**When upgraded to Team plan:**
1. Go to Supabase Dashboard → **Authentication → Hooks**
2. Add a new **HTTP** hook for auth events
3. URL: `https://bcdosjrbkkemsqowhigj.supabase.co/functions/v1/auth-events-hook`
4. Set `AUTH_HOOK_SECRET` in Dashboard → Edge Functions → auth-events-hook → Secrets

### Step 3 - Wire send-reminders scheduling

✅ **Unblocked (2026-08-11).** The `alter database postgres set app.supabase_project_url / app.supabase_service_key` approach works via the Supabase Dashboard SQL Editor - earlier assumption that it required superuser was incorrect.

Setup steps (once per environment, done via Supabase Dashboard SQL Editor):
```sql
alter database postgres set app.supabase_project_url = 'https://<ref>.supabase.co';
alter database postgres set app.supabase_service_key = '<service_role_key>';
select pg_reload_conf();
```

Then set Edge Function secrets for `send-reminders`:
- `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SMS_PROVIDER=mock`, `NEXT_PUBLIC_SITE_URL`

**SMS reminders: not yet active.** The `send-reminders` function supports SMS via Kaleyra but requires two DLT-approved template IDs: `KALEYRA_SMS_TEMPLATE_REMINDER` and `KALEYRA_SMS_TEMPLATE_OVERDUE`. These are separate from the OTP template (`KALEYRA_SMS_TEMPLATE_ID`). Until these are registered and approved with Kaleyra, keep `SMS_PROVIDER=mock` in the Edge Function secrets - email reminders work fully. Enable SMS by setting `SMS_PROVIDER=kaleyra` and adding both template IDs once approved.

The `overdue-recompute` job works fine (pure SQL, no secrets).

### Step 4 - Smoke-test auth events

Log out and log back in, then check the super-admin Activity Log → Auth Events tab. A `auth.login` row should appear.

---

## Activity Log - Phase 4 deferred items

**Feature:** Activity Log / Audit Log (v1.4)  
**Context:** Phase 1–3 shipped in v1.4 (audit_logs table, UI with tabs/icons/search/pagination, error instrumentation, Edge Function hooks). These items were descoped to keep scope manageable.

### P4-A: Tab count badges

Show event counts on each filter tab so users can spot anomalies at a glance (e.g. "Errors (12)").

**Approach:** Run a single aggregation query alongside the main log query:
```sql
select event_type, count(*) from audit_logs
where association_id = $1
group by event_type;
```
Map the counts to the tab keys and render as a `<Badge>` inside each `EventTypeTabs` entry.

**Files:** `audit-shared.tsx` (EventTypeTabs needs a `counts` prop), `audit/page.tsx` (add count query), `admin/activity/page.tsx` (same).

### P4-B: CSV export

Allow admins to download the current filtered view as CSV for compliance/reporting.

**Approach:** Add a "Download CSV" button to `audit-log-card.tsx` and `admin-activity-card.tsx`. On click, fire a server action or route handler that re-runs the same filtered query (no pagination) and streams a CSV response.

**Files:** New route `app/api/audit/export/route.ts`, button in both card components.

### P4-C: Audit log retention policy (90-day pruning)

Prevent unbounded table growth. Rows older than 90 days should be pruned automatically.

**Approach:** Add a pg_cron job in a new migration:
```sql
select cron.schedule(
  'prune-audit-logs',
  '0 2 * * *',  -- 2 AM UTC daily
  $$delete from audit_logs where created_at < now() - interval '90 days'$$
);
```

Consider whether auth_event and error rows should have a longer retention (180 days) for compliance.

---

## Known gap: Admin action errors not logged to Activity Log

**Priority:** Low  
**File:** `packages/features/admin/src/lib/server/admin-server-actions.ts`

Safe-action failures (e.g. duplicate email on Edit User, invalid phone) throw and return a typed error to the UI but never write to `audit_logs`. The Errors tab in the super-admin Activity Log only shows rows explicitly written with `event_type: 'error'` via `lib/audit-log.ts` - unhandled safe-action throws are invisible there.

**Fix:** Add a `catch` block in each admin action that writes a failure row:

```ts
} catch (err) {
  await logAuditEvent({
    action: 'admin.update_user.failed',
    eventType: 'error',
    summary: err instanceof Error ? err.message : String(err),
    entityType: 'user',
    entityId: userId,
  });
  throw err; // re-throw so safe-action still returns the error to the UI
}
```

Affects all actions in `admin-server-actions.ts`. Consider a shared `withAuditError()` wrapper to avoid repetition.

---

## Enhancement: URL sync for Payments page type/unit filters

**Priority:** Low  
**File:** `apps/web/app/[locale]/home/[account]/payments/_components/payments-section.tsx:102-117`

**Context:** `typeFilter` and `unitFilter` are client-side state only. The `statusFilter` already syncs from the `?status=` URL param (used by billing overview "Outstanding" links), but `typeFilter` and `unitFilter` don't persist in the URL. This means you can't bookmark or share a filtered payments view for type or unit.

**Fix:** Add `?type=` and `?unit=` query params to the URL using `useRouter`/`useSearchParams`, similar to how `?status=` is handled. The payments-section will need to read initial values from `searchParams` passed as props from the page server component.

---

## Bug: "Partial" payment status filter returns no results when all partial bills are overdue

**Priority:** Medium  
**File:** `apps/web/app/[locale]/home/[account]/payments/_components/payments-section.tsx:133`

**Root cause:** The Partial filter gates on `b.due_date >= today`, so it only finds partially paid bills still within their due date. Once a partial bill crosses its due date, `displayBillStatus()` promotes its badge to "Overdue" and the Partial filter stops matching it. In a live association where most partial bills have aged past due, the filter returns nothing - which looks broken to the admin.

**Fix:** Remove the date restriction from the Partial filter:
```typescript
// Before
rows = rows.filter((b) => b.status === 'Partial' && b.due_date >= today);

// After
rows = rows.filter((b) => b.status === 'Partial');
```

"Partial" should mean any bill with a payment received but not fully paid, regardless of due date. The row-level badge already distinguishes Partial vs Overdue per bill. This is consistent with how the Paid and Collected filters work (no date restriction). The overlap between Partial and Overdue filters is acceptable - the badge tells the full story at row level.

---

## Feature: assoc_admin personal bill view + Razorpay self-service

**Priority:** High  
**Depends on:** Merge `week-4` branch (contains Razorpay `create-order`/`verify` API routes and Pay button components)

### Background

An `assoc_admin` who is also a unit owner or tenant currently sees the full admin view of all association bills. They have no personal "My Bills" view and cannot pay their own bill online via Razorpay - the self-service Pay button is only wired up for `prop_owner` and `tenant` roles.

The multi-role assignment gate has already been fixed (merged to `main`): an admin can now be assigned as `owner_id` on a unit and/or as `tenant_id` on a tenancy. The payments page also already unions owned + tenanted unit IDs for restricted users. What is missing is:

1. Detecting on the payments page that the logged-in `assoc_admin` also has personal bills (is `owner_id` on any unit OR has an active tenancy)
2. Showing them a "My Bills" resident-style view alongside the admin view
3. Wiring the Razorpay Pay button to their personal bills (same as `prop_owner`/`tenant` already get after `week-4` is merged)

### Implementation plan

**`apps/web/app/[locale]/home/[account]/payments/page.tsx`**

After resolving `role` and `userId`:

```ts
// Detect if this admin also has personal bills
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

Then fetch personal bills separately (same query used for `prop_owner`/`tenant`) and pass them as a second prop to `PaymentsSection`, or render a second `PaymentsSection` block above the main one with `title="My Bills"` and `canManage={false}` + `canPay={true}` (Razorpay).

**`PaymentsSection` component**

Add a `canPay` prop (boolean). When true, render the Razorpay Pay / Pay All buttons (already exists in `week-4` branch, gated on `canManage === false && canPay === true`). Currently those buttons check `isUserRestricted` implicitly - after `week-4` merge, expose `canPay` as an explicit prop so admins can get the button too.

**UI layout on payments page**

- If `hasPersonalBills`: render a "My Bills" `PaymentsSection` (restricted view, canPay=true) first, then the full "All Payments" admin section below it
- If `!hasPersonalBills`: render only the admin view as today

### Notes

- No DB or RLS changes needed - `units.owner_id` and `tenancies.tenant_id` are already set correctly after the multi-role fix
- The Razorpay `create-order` and `verify` routes live in `week-4`; do not re-implement them - just merge that branch first
- After merging `week-4`, search for `isUserRestricted` in the payments section and replace with the explicit `canPay` prop pattern

---

## Known gap: sub-meter initial_reading not set at onboarding

**Priority:** Medium  
**Context:** Citadel PRISM sub-meters were imported without `INITIAL_METER_READING` values, so `sub_meters.initial_reading = 0` for all meters. This means the first bill's consumption is calculated as (current reading − 0) instead of (current reading − actual installation reading), producing inflated first-period units.

**Fix:** Run a one-time SQL update with the correct initial readings per meter, confirmed with the association admin. No code change needed - the column and import path exist and work correctly.

```sql
-- Example: update initial_reading for specific meters
UPDATE sub_meters SET initial_reading = <actual_value> WHERE meter_label = '<label>';
```

---

## SEO / GEO / AEO - public site improvements

**Priority:** High once the product is ready to be discovered. Audit done 2026-09-24 against `main` and live https://ooruda.com.

### Current state

- Done (Sept SEO commit): robots.txt (blocks `/home`, `/admin`, `/api`; AI crawlers allowed), sitemap, title/description, Open Graph + Twitter tags with OG image, Organization / SoftwareApplication / WebSite JSON-LD, one H1 then H2/H3, image alt text.
- Gaps: the homepage is ~200 words of generic copy; title is "Ooruda — Private Beta"; no canonical; `www.ooruda.com` serves 200 (duplicate host); no `llms.txt`; no FAQ/feature/pricing pages; no India/GST/MESCOM wording; `sameAs` points to an unverified Twitter; hero images hotlinked from Unsplash/Pexels; `lang="en"` not `en-IN`; homepage lastmod stale (2026-07-19); root layout reads `headers()` (CSRF token) so every public page renders dynamically - one cold request took 4.2s.

### Actions (in priority order)

1. ~~**Keep the landing page on the v2.3 -> main merge.**~~ **Done (2026-10-20)** in the `release` -> `main` merge: `/` remains the public landing page and the root entry is retained in `apps/web/app/sitemap.ts`.
2. **Rewrite the homepage around what the product does** (~800-1,200 words): one-line definition, a section per module (billing + GST invoices, electricity sub-metering, payments + receipts, cash ledger, owner/tenant portal, reports), who it is for, where it works (India), how onboarding works. Retitle, e.g. "Ooruda – Billing & Management Software for Commercial Property Associations in India"; make title/description match the OG copy. *Needs wording/positioning input.*
3. **Add 3-5 focused pages** - Features (per module), Pricing (even "contact us"), FAQ, About, Security & data. Each: clear H1, a one-paragraph direct answer at the top, a short FAQ. Add them to the sitemap.
4. **Structured data to match:** FAQPage on the FAQ; SoftwareApplication with `offers`, `areaServed: IN` and a feature list; BreadcrumbList on inner pages; Organization with real `sameAs` (LinkedIn etc.) and a contactPoint. Remove/replace the Twitter `sameAs` if the account doesn't exist.
5. **Fix duplicate host + canonicals:** redirect `www` → apex in Vercel domain settings (dashboard, not code); add a per-page canonical on each public page (not in the root layout - it would be inherited app-wide).
6. **Add `/llms.txt`:** plain-text summary of what Ooruda is, who it is for, key features, links to the pages above.
7. **Off-site presence (biggest GEO lever, non-code):** LinkedIn company page, Google Business Profile, SaaS directories (G2, Capterra, Indian SaaS directories); 1-2 topical articles, e.g. "How to split a commercial electricity bill across sub-meters", "GST on association maintenance charges".
8. **Make public pages static/cacheable:** stop the root layout reading `headers()` for public routes so the landing page prerenders (removes the cold-start delay).
9. **Small items:** self-host the hero images (and use `next/image`), set `lang="en-IN"`, keep sitemap lastmod accurate.

Code: 1, 2, 3, 4, 5 (canonical), 6, 8, 9. Dashboard/off-site: 5 (www redirect), 7.

---

## UI Component Modernization - site-wide audit

**Priority:** Medium  
**Context:** Identified during Villa 19 (Habbaa) build. The same issues exist in Ooruda. All forms and interactive components should use modern, custom-built UI instead of OS-native or outdated widgets.

### 1. Replace native `<input type="date">` with a custom DatePicker

OS-native date pickers look like 2012 - ugly, inconsistent across browsers and OSes, and impossible to brand. Replace everywhere with a custom React calendar component.

**Reference implementation:** `villa-booking/src/components/ui/DatePicker.tsx`  
- Zero external dependencies (pure React + CSS variables)  
- Inline calendar dropdown with month navigation  
- Branded with project design tokens (maroon header, brass accent day indicators, today ring)  
- Props: `value` (ISO string), `onChange`, `min`, `max`, `clearable`, `dropdownAlign`, `compact`  
- Keyboard accessible: ESC closes, outside-click closes  
- Aria: `aria-haspopup="dialog"`, `aria-expanded`, `aria-label` per day cell  

**Places to update in Ooruda:**
- Any maintenance request form with date fields
- Bill due date pickers in admin forms
- Booking / scheduling forms
- Filter date range pickers on payments, audit log pages

### 2. Audit all buttons for hover/active states

Every interactive button must have visible hover feedback. No `transition-all` without a `hover:` class.

**Patterns to enforce:**
| Button type | Hover | Active |
|---|---|---|
| Primary filled (brand color) | `hover:brightness-90` | `active:scale-[0.98]` |
| WhatsApp green (`#25D366`) | `hover:brightness-110` | `active:scale-95` |
| Frosted glass on dark bg | `hover:bg-white/25` | `active:scale-95` |
| Outline on light bg | `hover:border-[brand]` + text darken | `active:scale-[0.98]` |
| Ghost / text | `hover:bg-[tint]` | - |

### 3. Form input focus rings

Native `focus:outline-none` with no replacement leaves keyboard users with no visible focus indicator. Add:
```
focus:ring-2 focus:ring-[brand-color] focus:ring-offset-1 transition-shadow
```
to every `<input>`, `<textarea>`, `<select>`.

### 4. Dead component cleanup

Remove any components not imported anywhere. Dead code creates confusion and shows up in type-checker output. Before each release, run:
```bash
grep -rn "export default" src/components --include="*.tsx" | awk -F: '{print $1}' | while read f; do name=$(basename $f .tsx); grep -rq "$name" src/app src/components --include="*.tsx" --exclude="$f" || echo "UNUSED: $f"; done
```

### 5. No OS-native select dropdowns for important choices

`<select>` looks different on every OS. For any dropdown that matters to UX (status filters, role pickers, date range presets), build a custom popover-based dropdown using the same pattern as the BookingWidget guest counter.

---

## Known risk: Razorpay partial refund webhook not idempotent

**Priority:** Low (low-probability in practice)
**Introduced in:** `20260725000001_partial_refund.sql` + webhook route change (2026-07-22)

**Risk:** The `record_payment_reversal(payment_id, refund_amount)` function accumulates `refunded_amount` on each call. If Razorpay delivers the same partial refund webhook event twice (e.g., our server returned non-200 on first delivery, triggering Razorpay retry), the refunded amount gets double-counted.

**Example:** ₹300 partial refund on a ₹1,000 payment.
- First delivery: `refunded_amount` → ₹300 ✓
- Duplicate delivery: `refunded_amount` → ₹600 ✗ (bill incorrectly shows Partial with ₹400 outstanding instead of ₹700)

**Why it is low-risk now:** The webhook handler returns 200 on success, so Razorpay does not retry for the same event. Retries only happen on network failure or a non-2xx response from our side.

**Proper fix:** Store the Razorpay refund ID (`rfnd_xxx`, available in the refund entity payload) in a `payments.razorpay_refund_id` column and add a unique constraint. The `record_payment_reversal` function should skip already-processed refund IDs. Requires a migration to add the column and a webhook change to pass `refundEntity.id`.

---

