# Ooruda — Backlog & Upcoming Work

Items that are scoped and understood but not yet implemented. Each entry includes enough context to pick up without re-investigating.

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

**Root cause:** The Partial filter gates on `b.due_date >= today`, so it only finds partially paid bills still within their due date. Once a partial bill crosses its due date, `displayBillStatus()` promotes its badge to "Overdue" and the Partial filter stops matching it. In a live association where most partial bills have aged past due, the filter returns nothing — which looks broken to the admin.

**Fix:** Remove the date restriction from the Partial filter:
```typescript
// Before
rows = rows.filter((b) => b.status === 'Partial' && b.due_date >= today);

// After
rows = rows.filter((b) => b.status === 'Partial');
```

"Partial" should mean any bill with a payment received but not fully paid, regardless of due date. The row-level badge already distinguishes Partial vs Overdue per bill. This is consistent with how the Paid and Collected filters work (no date restriction). The overlap between Partial and Overdue filters is acceptable — the badge tells the full story at row level.

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
