# Ooruda — Backlog & Upcoming Work

Items that are scoped and understood but not yet implemented. Each entry includes enough context to pick up without re-investigating.

---

## Feature: assoc_admin personal bill view + Razorpay self-service

**Priority:** High  
**Depends on:** Merge `week-4` branch (contains Razorpay `create-order`/`verify` API routes and Pay button components)

### Background

An `assoc_admin` who is also a unit owner or tenant currently sees the full admin view of all association bills. They have no personal "My Bills" view and cannot pay their own bill online via Razorpay — the self-service Pay button is only wired up for `prop_owner` and `tenant` roles.

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

Add a `canPay` prop (boolean). When true, render the Razorpay Pay / Pay All buttons (already exists in `week-4` branch, gated on `canManage === false && canPay === true`). Currently those buttons check `isUserRestricted` implicitly — after `week-4` merge, expose `canPay` as an explicit prop so admins can get the button too.

**UI layout on payments page**

- If `hasPersonalBills`: render a "My Bills" `PaymentsSection` (restricted view, canPay=true) first, then the full "All Payments" admin section below it
- If `!hasPersonalBills`: render only the admin view as today

### Notes

- No DB or RLS changes needed — `units.owner_id` and `tenancies.tenant_id` are already set correctly after the multi-role fix
- The Razorpay `create-order` and `verify` routes live in `week-4`; do not re-implement them — just merge that branch first
- After merging `week-4`, search for `isUserRestricted` in the payments section and replace with the explicit `canPay` prop pattern

---

## Known gap: sub-meter initial_reading not set at onboarding

**Priority:** Medium  
**Context:** Citadel PRISM sub-meters were imported without `INITIAL_METER_READING` values, so `sub_meters.initial_reading = 0` for all meters. This means the first bill's consumption is calculated as (current reading − 0) instead of (current reading − actual installation reading), producing inflated first-period units.

**Fix:** Run a one-time SQL update with the correct initial readings per meter, confirmed with the association admin. No code change needed — the column and import path exist and work correctly.

```sql
-- Example: update initial_reading for specific meters
UPDATE sub_meters SET initial_reading = <actual_value> WHERE meter_label = '<label>';
```

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

