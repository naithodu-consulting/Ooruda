# Ooruda Villa v1.0 — Integration Plan

> Branch: `villa-v1.0`, cut from `release` @ `4c54799a`. Merges back to `release` in future.
> Scope: **internal operator app only.** The guest-facing site stays in the `villa-booking` repo.
> Ooruda Supabase: unchanged (dev `bcdosjrbkkemsqowhigj`, prod `vkxchopjqakvftcnxwie`).
> Roles: platform **super-admin** (existing) + **`villa_owner`** + **`villa_manager`**.
> Money: **rupees `numeric(12,2)`** everywhere in Ooruda. Paise only inside the villa-DB adapter.
> Booking numbers: the guest site's existing `booking_code` (`V19-7KQ-M4X`), everywhere, for
> everything operator- and guest-facing. `UV-YYMM-XXX` is dropped. The statutory GST invoice
> series is the one exception and is not a booking number. See §9.
> **Decisions taken** are recorded in §14; `villa-booking` repo work is specced in that repo's
> `TODO.md` and is **not** part of this workstream.

---

## 0. The decisive find

`villa-booking/docs/OORUDA_VILLA_INTEGRATION.md` (last reviewed 2026-09-23) already settles the
integration, and it settles it well:

> "Villa 19's guest site (habbaa.in) has no admin of its own. Ooruda Villa blocks dates, records
> phone/WhatsApp bookings, changes rates and processes cancellations and refunds by **writing
> directly into this database**."

So there is **no webhook/outbox/HMAC contract to build**. Ooruda Villa holds a second Supabase
client pointed at the villa-booking project, using that project's `service_role` key, server-side
only. Availability writes go through the site's own `create_booking_atomic` / `check_availability`,
which take a per-property advisory lock.

That answers the race you were worried about, properly: **one lock, one authority, synchronous.**
Ooruda does not commit its own row until the villa DB has said yes.

The earlier draft of this plan proposed an async outbox + signed webhooks. That is now **withdrawn**
— it would have introduced exactly the distributed-transaction failure mode the existing design
avoids. Everything below is built on the contract.

---

## 1. What Ooruda is today (the parts that matter)

### 1.1 Tenancy chain

```
auth.users → accounts (team, is_personal_account=false) → associations (1:1, auto-created by trigger)
    → units → tenancies → bills → payments → receipts
    → charge_types, billing_settings, bill_sequences
    → sub_meters, meter_readings, mescom_bills
    → cash_ledger, expenses, vendors, amc_contracts
    → association_feature_flags, association_payment_gateways
```

`associations.account_id` is a UNIQUE 1:1 FK to `accounts`, so `association_id` is just "the account
in domain clothing". The villa module therefore needs **no equivalent indirection table** — villa
tables key on `account_id` directly.

### 1.2 Auth / RBAC plumbing

| Piece | Where | Behaviour |
|---|---|---|
| Role list | `apps/web/lib/rbac.ts` → `PROPOPS_ROLES` | `assoc_admin`, `billing_operator`, `prop_owner`, `tenant` |
| Role table | `public.roles` | `name` PK, `hierarchy_level` **UNIQUE**, 1–4 taken |
| Page guard | `requireRole(slug, roles[])` | one round trip, `react.cache`d |
| Action guard | `getAssociationRole(associationId)` | defence-in-depth before mutations |
| RLS helper | `public.association_role(id)` | policies must use this, never raw membership joins |
| JWT hook | `kit.propops_custom_access_token_hook` | injects `{account_id: role}` |
| Super-admin | `raw_app_meta_data.role='super-admin'` + `is_super_admin()` | `requireRole` maps it to `assoc_admin` |
| Invite gating | `assoc_admin_permissions` | zero rows = allowed |

### 1.3 Workspace shell

`app/[locale]/home/[account]/layout.tsx` loads workspace + cookies + feature flags + consent in one
parallel stage, then renders `TeamAccountLayoutSidebar`, `TeamAccountTopbar`, `ConsentGate`.
Nav: `config/team-account-navigation.config.tsx` → `getTeamAccountSidebarConfig` →
`filterSidebarConfigByRole(config, role, disabledNavKeys)`.

### 1.4 Feature vertical shape (copy Expenses — the cleanest)

```
<feature>/page.tsx                        server: requireRole + parallel queries
        /_components/<f>-page-client.tsx  client shell, seeds useState from server props
        /_lib/schemas/<f>.schema.ts       zod, separate file for action reuse
        /_lib/server/<f>-actions.ts       authActionClient + revalidatePath + logAuditEvent
        /_lib/server/<f>.service.ts       business logic
```

### 1.5 Reusable infrastructure — do not rebuild

| Capability | Where | Villa reuse |
|---|---|---|
| PDF render + cache + branding invalidation | `lib/server/pdf-renderer.ts`, `lib/server/pdf-cache.ts`, `packages/pdf-templates` | GST invoice, receipt, booking voucher, reports |
| Document numbering | `bill_sequences` + `allocate_bill_no` | GST invoice series |
| Audit log | `lib/audit-log.ts` → `audit_logs`, `/audit` | every booking/rate/refund/ID-view event |
| Cron → pg_net → Edge Function | `20260806000002_reminder_cron.sql` + `functions/send-reminders` | pre-arrival / post-checkout mail |
| Transactional email | `@kit/email-templates` (react-email) + Resend, `lib/notify.ts` | new villa templates |
| Bulk dispatch UI | `/admin/bill-dispatch` | invoice dispatch pattern |
| SMS / OTP | `@kit/sms`, `custom-sms-hook` | staff login (already shared) |
| Reports, FY picker, CSV | `/reports`, `lib/financial-year.ts`, `lib/export-csv.ts` | revenue/occupancy reports |
| Money / date helpers | `lib/format-inr.ts`, `lib/billing-dates.ts` (`todayInBillingZone`) | everywhere |
| Expense tracker vertical | `expenses/*` + `expense_categories`, `vendors` | pattern for `villa_expenses` |
| Super-admin panel | `app/[locale]/admin/*`, `AdminGuard` | villa account creation, activity |
| Storage + document access | `schemas/16-storage.sql`, `lib/server/unit-document-access.ts` | guest ID documents |

---

## 2. Money: rupees. Agreed.

You are right, and the codebase already proves it. Every Ooruda money column is `numeric(12,2)`
rupees (`bills.total_amount`, `payments.amount`, `expenses.amount`, …), and paise appear in exactly
one place — the Razorpay boundary:

```ts
const amountPaise = Math.round(totalOutstanding * 100);   // create-order
const verifiedAmount = rzpPayment.amount / 100;           // verify
```

`numeric` is exact decimal, so the float argument for paise does not apply here. Introducing a
paise-based villa module would put two money conventions inside one codebase — the likeliest source
of a silently wrong number on an invoice.

**Decision:** villa amounts are `numeric(12,2)` rupees. The villa-booking DB requires integer paise
(contract rule 6), so conversion lives in **one adapter module**, `lib/villa-db/money.ts`, with
`toPaise()` / `fromPaise()` and unit tests (built: `lib/villa/money.ts`), used only by the
villa-DB client. Rupees never leave Ooruda's storage and UI; paise appear only in that adapter and
in pure exact-arithmetic helpers such as `lib/villa/gst.ts`, whose callers convert at the edge.

---

## 3. Architecture: two databases, one authority per concern

### 3.1 The split

| Concern | System of record | Why |
|---|---|---|
| **Availability** (all of it) | villa-booking DB | It owns `create_booking_atomic`, the advisory lock, `check_availability`, `get_unavailable_nights`. One overlap predicate, used by guests, staff and channel managers alike. |
| Bookings (the reservation itself) | villa-booking DB | Same lock. Contract rule 4: never INSERT directly. |
| Rates, seasonal rules, occupancy, extra-guest | villa-booking DB | The site's pricing engine reads them; a phone quote and an online quote must agree. |
| Online payments (`payments`) | villa-booking DB | Written by the site's Razorpay flow. Ooruda reads, does not write (contract §7). |
| **Offline payment ledger** | **Ooruda** | The site's `payments` requires a unique `razorpay_order_id`; cash/UPI/bank payments have nowhere to live there. The site only carries a derived `payment_status`. |
| **GST invoices + credit notes** | **Ooruda** | Gapless per-FY series, PDF, dispatch. Contract §5.7 explicitly says booking codes are not invoice numbers. |
| **Guest identity documents** | **Ooruda** | Today they only exist on WhatsApp; the site stores nothing but `id_status`. See §7. |
| **Expenses** | **Ooruda** | Does not exist on the site at all. |
| **Emergency contacts, add-on catalogue metadata, message log** | **Ooruda** | Operator data, no guest-site counterpart. |
| **Discount codes** | **split** — defined in Ooruda, *enforced and counted* on the site | Redemption happens at checkout. See §10. |

### 3.2 Why manual blocks and offline bookings are safe

Your question: *what if we have to block dates or take a booking manually, while a channel manager
is also selling on MMT/Goibibo?*

Because Ooruda writes into the **same** availability ledger the site and the channel manager read,
there is no second source to diverge from:

```
 Ooruda Villa ─┐
 habbaa.in ────┼──► villa-booking DB ──► check_availability() / get_unavailable_nights()
 Channel mgr ──┘        (advisory lock)          ▲
                                                 └── channel manager pulls availability here
```

The site already has `channel_sync_log` and `external_reservations (UNIQUE channel,
channel_reservation_id)` waiting for the channel-manager integration, and `booking_code` is assigned
by a DB trigger on *any* confirm "however that happens (website payment, this app, an OTA import)".
So an OTA reservation, a WhatsApp booking and a maintenance block all reduce to rows the same
predicate sees.

**Operator flow for a manual block or booking (the "reserve then record" pattern):**

1. Ooruda calls `check_availability(property, from, to)` on the villa DB.
2. If available, it performs the *authoritative* write there — `INSERT blocked_dates` for a block,
   or `create_booking_atomic` + the guarded `status='pending' → 'confirmed'` update for a booking
   or an event.
3. **Only then** does Ooruda commit its own rows (payment ledger, guest links, mirror).
4. If step 2 fails with `DATE_UNAVAILABLE` / `DATE_BLOCKED`, the manager sees "those nights are no
   longer free" — which is the correct answer, not an error.

Failure mode to design for: step 2 succeeds, step 3 fails. That leaves an orphan block/booking on
the site. Mitigation: stamp `blocked_dates.notes` / `bookings.special_requests` with an
`ooruda:<uuid>` marker, and run a reconciliation sweep that reports (does not auto-delete) site rows
with no matching Ooruda row after 15 minutes.

**Events** are modelled as a booking with `booking_channel='manual'` and an Ooruda-side
`villa_bookings_mirror.booking_kind='event'`, so they occupy dates, carry revenue, and appear in
occupancy — rather than as a silent block.

**The one risk no architecture removes:** OTA propagation delay. A channel manager takes seconds to
minutes to push a new block out to MMT/Goibibo. A booking landing on an OTA inside that window is an
inherent property of channel distribution. Mitigations: a per-property "OTA buffer nights" setting,
and an alert when a pulled OTA reservation collides with an existing block.

### 3.3 Reporting across two databases

Cross-database joins are impossible, and revenue reports must join bookings to Ooruda-side expenses,
invoices and payments. Three options were considered:

| | Read-through only | Full mirror | **Write-through + read-model (chosen)** |
|---|---|---|---|
| Freshness | always live | lags | live where it matters, lagged where it doesn't |
| Reporting | aggregate in app memory | SQL aggregation | SQL aggregation |
| FK from invoices to bookings | impossible | yes | yes |
| Sync bugs | none | many | few, and bounded |

**Chosen:** `villa_bookings_mirror` in Ooruda is a **derived read-model, never a source of truth.**

- Every Ooruda write to the villa DB upserts the mirror in the same request.
- A reconciliation cron (every 5 min) pulls rows where `updated_at > last_sync` to capture bookings
  that originated on the website or from an OTA import.
- **Operational screens** (calendar, availability check, new booking) read **live** from the villa DB.
- **Reporting, invoicing and dashboards** read the mirror, and every such screen shows
  "synced N minutes ago".
- The mirror is rebuildable from scratch; nothing depends on it being uniquely correct.

### 3.4 Connecting safely

The villa project's `service_role` key bypasses all RLS. Handling rules:

- Server-only. `import 'server-only'` at the top of `lib/villa-db/client.ts`; never in a client
  component, never in a `NEXT_PUBLIC_` variable.
- **More villas are coming, so credentials are per-property from day one.** Each
  `villa_properties` row stores `site_credentials_ref` — a **Supabase Vault** secret id, never the
  key itself. The adapter resolves the secret server-side per property and caches the resulting
  client for the request. This costs little now and is awkward to retrofit once bookings exist.
- Do **not** copy the `association_payment_gateways` precedent, which stores `key_secret` as
  plaintext in a table. A service-role key for an entire project is far more dangerous than a
  Razorpay key.
- A single env var remains the **bootstrap fallback** for local development only, behind an
  explicit `VILLA_DB_LOCAL_OVERRIDE` flag that is never set in dev, staging or production.
- One narrow adapter module is the only code allowed to hold the client. Every villa-DB call goes
  through a typed function there. No ad-hoc `.from('bookings')` scattered across pages.
- The adapter regenerates its own types from the villa project (`villa-db.types.ts`), kept separate
  from `lib/database.types.ts`.

---

## 4. Tenancy: how villa accounts sit beside association accounts

**Decision: shared `/home/[account]` shell, gated in one place.** Option 2 (a separate
`/villas/[account]` tree) buys a smaller blast radius, but breaks the team switcher: a super-admin,
or anyone holding both a villa and an association membership, needs one URL shape. You can buy the
same safety inside option 1 for the cost of one function.

1. `accounts.product_type text not null default 'association'` + check constraint.
2. `requireRole(slug, roles[], product = 'association')`, also returning `productType`. Mismatch →
   redirect. **The default argument gates all 19 existing association pages at once, with zero page
   edits.**
3. Villa pages sit on **disjoint path segments**: `/calendar`, `/bookings`, `/guests`, `/stays`,
   `/rates`, `/villa-payments`, `/villa-expenses`, `/villa-reports`, `/villa-settings`.
   Shared pages (`/settings`, `/settings/profile`, `/members`, `/notifications`, `/audit`) take
   `product: 'any'`.
4. The sidebar selects a **different nav config object** by product — the association nav is never
   constructed for a villa account.

### 4.1 Landmines found in the current code

1. **`kit.create_association_on_team_create()`** (`20260614000003_assoc_setup.sql`) inserts an
   `associations` row for *every* non-personal account. Guard it on
   `new.product_type = 'association'`, and create villa accounts via a new
   `public.create_villa_account(name, slug)` RPC that sets the column **in the same INSERT** —
   Makerkit's `create_team_account` cannot, so do not reuse it.
2. **`filterSidebarConfigByRole` fails open.** `if (!allowed || allowed === '*') return true` means
   `villa_owner` would be shown the entire association sidebar. Must deny unknown roles by default.
3. **`roles.hierarchy_level` is UNIQUE**; 1–4 taken, and 5 is used by Makerkit's seed/test
   `custom-role` → **`villa_owner = 10`, `villa_manager = 11`** (as built in M0).
   `has_more_elevated_role` / `can_action_account_member` compare levels globally, so a villa_owner
   ranks below a tenant (4). Harmless while the sets never share an account — must never become
   a cross-product comparison.
4. **`assoc_admin_permissions`** read policy allows only `assoc_admin` (already flagged in
   `OORUDA_KNOWLEDGE.md §4`). `villa_owner` cannot invite a manager until it is extended.
5. **`requireRole` maps super-admin → `assoc_admin`**; on a villa account it must map to
   `villa_owner` or every villa guard rejects the super-admin.

---

## 5. Data model (Ooruda side). All `villa_`-prefixed, all keyed on `account_id`.

RLS via a new `public.villa_role(p_account_id uuid)` helper, parallel to `association_role`.

```
villa_properties           one row per villa. name, slug, address, geo, status, is_test,
                           site_project_ref, site_property_id, booking_code_prefix,
                           gst_rate, gstin, sac_code, invoice_prefix,
                           ota_buffer_nights, retention_days
villa_property_credentials via Vault: villa_properties.site_credentials_ref -> secret id
villa_rooms                forward-compat for room-level selling. name, room_type, bed_type,
                           bed_count, max_guests, is_sellable_separately (default false)
villa_emergency_contacts   per property: role, name, phone (E.164), notes, display_order
villa_addons               extra bed, breakfast, BBQ, early check-in, late check-out, pet fee.
                           price (rupees), unit (per_stay|per_night|per_guest_per_night),
                           is_active, synced_to_site_at
villa_bookings_mirror      READ-MODEL. site_booking_id (unique), booking_code, reference_number,
                           booking_kind (stay|event), channel, status, payment_status,
                           check_in, check_out, nights, adults/children/infants,
                           base/extra_guest/discount/tax/total (rupees), id_status,
                           discount_code, room_scope (whole_property|rooms),
                           cancelled_at, cancellation_reason, cancelled_by,
                           guest_name/email/phone, site_updated_at, synced_at
villa_guests               guest master per account. name, phone (E.164), email, address, notes
villa_booking_guests       booking ↔ guest, is_primary, is_adult
villa_guest_documents      storage_path, doc_type, masked_number, stage (soft_copy|hard_copy),
                           captured_by, captured_at, verified_by, verified_at, purge_after
villa_booking_payments     THE payment ledger. mode (cash|upi|bank|card|online),
                           amount (rupees), paid_at, receipt_no, reference,
                           razorpay_payment_id (nullable), recorded_by
villa_refunds              THE refund record. payment_id, amount (rupees), reason,
                           razorpay_refund_id (unique, nullable for offline refunds),
                           status (initiated|processed|failed), initiated_by,
                           site_synced_at, credit_note_id
villa_invoices             GST tax invoice. invoice_no (gapless per FY), booking ref,
                           taxable_value, cgst, sgst, igst, total, place_of_supply,
                           issued_at, pdf_path, status (issued|cancelled)
villa_credit_notes         against an invoice: reason, amount, cgst/sgst/igst, issued_at, pdf_path
villa_expenses             property_id, category, vendor, amount (rupees), gst_amount,
                           mode, date, invoice_no, attachment, recurring, notes
villa_expense_categories   seeded defaults per account
villa_discount_codes       code, type (percent|flat), value, max_discount, valid_from/to,
                           min_nights, max_uses, max_uses_per_guest, blackout ranges,
                           channels, stackable, status, created_by, approved_by
villa_discount_redemptions redemption log pulled back from the site. code, booking_code,
                           guest_phone, discount_amount (rupees), redeemed_at
villa_message_log          booking_id, template, channel, sent_at, status.
                           UNIQUE (booking_id, template) — the anti-double-send guard
villa_sequences            invoice / receipt number allocation (copies bill_sequences)
villa_sync_log             direction, entity, site_id, outcome, error, at
```

Deliberate choices:

- **Dates** are `date`, ranges half-open `[check_in, check_out)`, matching contract rule 3. All
  "today" comparisons use `todayInBillingZone()`; `new Date('YYYY-MM-DD')` is UTC midnight and
  shifts a day in IST.
- **Expenses/vendors duplication.** `expenses`, `vendors`, `expense_categories` are
  `association_id`-scoped. Generalising them to `account_id` touches live association code, so v1.0
  adds `villa_expenses` + `villa_expense_categories`. Consolidation → `TECH_DEBT.md`.
- **No `villa_payment_gateways`.** Online payments are taken on the guest site with its own
  Razorpay account. If Ooruda ever needs its own, generalise `association_payment_gateways` to
  `account_payment_gateways` rather than adding a third copy.

### 5.1 RLS

Standard template: RLS on, `revoke all from authenticated, service_role`, grant CRUD to
`authenticated`, policies built only on `villa_role(account_id)`.

| Area | villa_owner | villa_manager |
|---|---|---|
| Properties, rates, occupancy, add-ons, emergency contacts | read + write | read |
| Bookings, blocks, events | read + write | read + write, **mark completed** |
| Cancellations + policy refunds | read + write, reason mandatory | only when `managers_can_cancel` is on |
| Refund amount override | yes, note mandatory | **never** |
| Guests, ID documents | read + write | read + write |
| Payment ledger | read + write | **insert only** |
| Invoices, credit notes, refunds | read + write | read |
| Expenses | read + write | **no read** |
| Discount codes | read + write | read |
| Reports | full | occupancy only, no money |
| Members, settings | read + write | read |

**Cancellation is owner-only by default, with a one-switch option for managers.**

- The owner cancels directly; there is no request-and-approve flow.
- Account setting **`managers_can_cancel`** (default off) on Villa settings. When on, managers can
  cancel and issue a **policy-computed** refund. Overriding the refund amount stays owner-only in
  every case — that is where money is actually lost.
- A reason is **mandatory**, chosen from the list in §9c, and every reason accepts a free-text note;
  `other` requires it. The reason is stored on the mirror, written into the site's booking notes,
  quoted on the credit note, and included in the guest's cancellation email.
- Enforced in RLS, the server action and the UI. When the switch is off, managers see Cancel
  disabled with an explanation rather than hidden.

**Check-out / completed.** Managers (and owners) mark a stay **completed** at check-out. That sets
the villa DB's `bookings.status = 'completed'`, triggers the tax invoice (§9) and schedules the
post-checkout email (§8).

Super-admin access mirrors `20260708000000_super_admin_association_access.sql`.

---

## 6. Feature list, mapped to build cost

| Feature | Reuse | New work |
|---|---|---|
| Expense tracking | Expenses vertical + PDF export, near-verbatim | `villa_expenses`, property dimension |
| Guest registry + ID card storage | `unit-document-access.ts` pattern, storage schema | bucket, masking, retention sweep, `id_status` write-back |
| Revenue details / reports | `/reports`, Recharts, FY picker, CSV, `report-document.tsx` | occupancy, ADR, RevPAR, channel mix over the mirror |
| Occupancy + rates settings | — | rates screen writing `properties` / `pricing_rules` with overlap checks |
| Extra bed / misc settings | — | `extra_guest_rate`, `base_occupancy`, `max_occupancy`, `villa_addons` |
| GST invoice generation + sending | `bill_sequences`, `pdf-templates`, `bill-dispatch` | invoice model, credit notes, slab logic |
| Pre-arrival + post-checkout emails | cron → pg_net → Edge Function, `@kit/email-templates` | 2 templates, scheduler, manual send, `villa_message_log` |
| Emergency contact settings | — | small table + settings screen + email partial |
| Discount codes | — | Ooruda definition/approval **plus changes in `villa-booking`** (§10) |

---

## 7. Guest ID documents — the biggest change from today

Today (contract §5.7): IDs travel over **WhatsApp only**, nothing is stored in any database, and the
site tracks a three-state `id_status`. Staff delete the photos from WhatsApp one week after checkout.

You have asked for storage. That makes Ooruda the custodian of Aadhaar/passport scans, which is the
highest-risk data in the whole product. Design accordingly:

- Private bucket `villa-guest-docs`, path `{account_id}/{booking_id}/{uuid}`, never public. Access
  only through short-TTL signed URLs minted server-side after an explicit authorization check.
- Store a **masked** identifier only (`XXXX XXXX 1234`). Never a full Aadhaar number in a column.
- **Every view or download writes an `audit_logs` row** — who, which guest, when.
- Per-property `retention_days`, **default 30 days after check-out** (decided 2026-09-27), with a
  nightly sweep that deletes the object and tombstones the row. Both privacy notices state 30 days.
- Writing back: on upload set the site's `bookings.id_status='received'`; on staff verification set
  `'verified'`. That keeps the guest's booking page truthful.
- The Privacy page on habbaa.in currently does not mention retention (contract notes this as
  outstanding). Storing documents makes that a **prerequisite, not a nicety** — DPDP consent and
  notice need to be in place before the first upload.

---

## 8. Automated emails

Reuse the proven chain: `pg_cron` (09:00 IST) → `pg_net` → Edge Function → Resend via
`@kit/email-templates` — exactly how `send-reminders` works today.

| Template | Trigger | Manual override |
|---|---|---|
| Pre-arrival / welcome | T-2 days before check-in | "Send now" on the booking |
| Post-checkout / review request | T+1 day after checkout | "Send now" |
| GST invoice | on issue (see §9) | "Send" / bulk dispatch |
| ID document request | on confirm, if `id_status='pending'` | WhatsApp deep link |

Guards, all of them needed:

- `villa_message_log` with `UNIQUE (booking_id, template)` — the only reliable double-send defence.
- Skip cancelled/expired bookings at send time, not at schedule time.
- The site sends its own booking-confirmation email. Ooruda must not duplicate it — pre-arrival is
  a distinct, later message.
- Phone/WhatsApp bookings may have `guest_email = ''` (contract §5.1 requires a non-null string).
  Fall back to WhatsApp, and never attempt a send to an empty address.

---

## 9. GST invoicing

Confirmed in scope. Reuse `bill_sequences`/`allocate_bill_no` for numbering and
`packages/pdf-templates` for the document.

**Numbering.** `booking_code` (`V19-7KQ-M4X`) is **the** booking number, everywhere: operator
screens, staff search, guest emails, WhatsApp, invoices, receipts, reports and exports.
`UV-YYMM-XXX` is dropped. Ooruda never mints a booking identifier of its own; it reads the one the
villa DB's trigger assigned, and ports `normalizeBookingCode` from `src/lib/booking-code.ts` so
staff can type it in any case, without hyphens, or with `O` for zero.

**One exception, and it is a legal one.** A GST tax invoice must carry a consecutive serial number,
unique within a financial year. `booking_code` cannot serve: it is random Crockford Base32, not
sequential, and a cancelled booking would leave a hole in the series. So invoices keep a **separate
statutory series** — `INV/26-27/0001`, prefix configurable per property via
`villa_properties.invoice_prefix`, allocated by `allocate_bill_no`'s pattern **only at the moment of
issue**, never at booking creation. Every invoice prints the `booking_code` prominently as the
customer-facing reference, so staff and guests still deal in one number. Flagging this explicitly
rather than silently overriding the "use booking_code only" decision — say the word if you want it
handled differently.

**Timing.** Recommended, and matching how Ooruda already handles advances:

| Event | Document |
|---|---|
| Advance/deposit received | **Receipt voucher** (not a tax invoice) |
| Checkout / stay completed | **Tax invoice** for the full stay, advance adjusted |
| Cancellation or downward revision after invoicing | **Credit note** |

Issuing at checkout is the safer reading of "supply completed" for accommodation, and it also lets
the invoice capture actual extras (extra bed, late checkout, damages).

**Rates — checked 2026-09-27.** SAC **996311** (room or unit accommodation). Since
**22 Sep 2025** (Notification No. 15/2025-Central Tax (Rate), 56th GST Council) the 12% slab is gone:

| Value of supply per unit per day | GST | ITC |
|---|---|---|
| up to ₹7,500 | **5%** | not available |
| above ₹7,500 | **18%** | available |

The old ₹1,000/day exemption was withdrawn on 18 Jul 2022 (some sites still list it — they are stale).

What this means for the build:

- The slab is decided on the **actual transaction value per unit per day** — after discounts, and
  **including extra-bed / extra-guest charges** — not on a published tariff. So it must be
  computed **per night**, after discount and extras, not once per property.
- Villa 19 at ₹14,500–18,500/night stays at 18% even with the maximum 25% discount (₹10,875 >
  ₹7,500). A room-level villa at ₹3,000/room would be 5% — the per-night logic handles both.
- A stay can straddle slabs (one night ₹7,000, another ₹9,000). Each night is taxed at its own
  rate; the invoice shows one line per rate.
- "Unit" is what is sold: the whole villa for Villa 19, a room for a room-level villa.
- **Place of supply** is the property's location (IGST Act s.12(3)), so it is always CGST+SGST
  split equally for a Karnataka villa, whatever the guest's state.
- The villa site's `pricing-engine.ts` hardcodes 18 — correct for Villa 19 today, wrong the moment
  a discounted or cheaper stay drops a night below ₹7,500. The slab logic is added to the
  villa-booking TODO so both sides compute identically. Ooruda implements it in one tested helper,
  `lib/villa/gst.ts`.

Still worth a one-line confirmation from your CA before invoices go live, since this is the most
expensive thing to get wrong — but the plan no longer depends on it.


---

## 9b. Refunds and cancellations — closing the silent gap

Today a refund issued from the Razorpay dashboard updates **nothing**: the guest site's webhook is
off (contract §7), so `payments.status` stays `captured`, the booking stays `confirmed`, and the
dates stay blocked. Resolving this is a v1.0 requirement, not a nice-to-have.

**Ooruda owns the whole refund path.** Staff stop using the Razorpay dashboard for villa refunds.

1. Owner opens the booking, clicks Cancel, **picks a reason**, and sees the refund due under the
   published cancellation policy (`property_policies`, key `cancellation`: 90% at 30+ days, 50% at
   15–29 days, none under 15) with an override field and a mandatory note when overridden.
2. Ooruda calls the **Razorpay Refunds API** server-side with an idempotency key derived from
   `villa_refunds.id`, so a retry or a double-click cannot refund twice.
3. On success, in order: write `villa_refunds` (status `processed`), mirror into the villa DB
   exactly as contract §7 prescribes —
   `UPDATE payments SET status='refunded' …` and
   `UPDATE bookings SET status='cancelled', payment_status='refunded' …` — then issue the
   **credit note** against the original tax invoice, then release the dates, then email the guest.
4. Offline refunds (cash/bank) skip step 2 and record `razorpay_refund_id = null` with the
   transfer reference instead.
5. Partial refunds are first-class: `villa_refunds` rows accumulate against a payment, and the
   credit note carries the actual amount and its GST split.

**Guards, because step 2 and step 3 are in different systems:**

- `villa_refunds` is written as `initiated` **before** the Razorpay call and moved to `processed`
  after, so a crash mid-flight leaves a visible stuck row rather than a silent loss.
- A **daily reconciliation** pulls refunds from the Razorpay API and flags any with no matching
  `villa_refunds` row, and any booking whose villa-DB `payment_status` disagrees with Ooruda's
  ledger. This is the safety net for the dashboard being used anyway, and for the contract's
  "paid but expired" case (a guest who closes the browser after paying).
- Idempotency on the inbound side too: replaying a reconciliation must never double-count. Keyed on
  `razorpay_refund_id` UNIQUE.
- Ooruda's existing `record_payment_reversal` bug (accumulating `refunded_amount` on each call,
  `TODO.md`) is **not** reused here. `villa_refunds` records discrete rows and derives the total,
  which makes double-counting structurally impossible rather than merely unlikely.

The alternative — turning the guest site's webhook back on — is recorded in the villa repo's TODO
as the rejected option, so nobody re-opens it by accident and ends up with two writers.

## 9c. Cancellation reasons

Compiled from how Opera Cloud (mandatory configurable reason codes), Airbnb (valid host reasons —
damage, emergency repairs; *not* double-booking or forgetting to block) and Booking.com (no-shows,
payment issues, guest request) classify cancellations. Each reason carries **who initiated it** and
a **default refund rule**, so the refund screen pre-fills correctly and the owner only overrides
exceptions.

| Code | Label | Initiated by | Default refund |
|---|---|---|---|
| `guest_change_of_plans` | Guest changed plans | guest | cancellation policy |
| `guest_travel_disruption` | Travel disruption (flight/train/road) | guest | cancellation policy |
| `guest_medical_or_bereavement` | Medical emergency or bereavement | guest | cancellation policy (owner may waive) |
| `guest_group_change` | Group size or composition changed | guest | cancellation policy |
| `guest_duplicate_booking` | Duplicate booking by guest | guest | full |
| `no_show` | Guest did not arrive | guest | none |
| `payment_not_received` | Payment not received | system | full (of anything paid) |
| `payment_failed_or_disputed` | Payment failed or charged back | system | none |
| `id_verification_failed` | Valid ID not provided | guest | cancellation policy |
| `house_rules_violation` | House-rules violation (e.g. undeclared event/party) | guest | none |
| `suspected_fraud` | Suspected fraud | system | none |
| `property_damage_or_repair` | Damage or emergency repair | host | full |
| `utility_outage` | Power / water outage | host | full |
| `scheduled_maintenance` | Scheduled maintenance | host | full |
| `double_booking` | Double booking / channel conflict | host | full |
| `owner_use` | Owner use of property | host | full |
| `pricing_error` | Rate or pricing error | host | full |
| `force_majeure` | Weather, disaster, government restriction, local unrest | external | full |
| `other` | Other | any | owner decides — **note required** |

Host-initiated cancellations default to a full refund because the guest is not at fault; they are
also the ones OTAs penalise, so reports break them out separately. Stored as a lookup table
(`villa_cancellation_reasons`) rather than a Postgres enum, so an owner request to add one is a row,
not a migration.

## 10. Discount codes — the one feature Ooruda cannot build alone

Redemption happens at checkout, on the guest site. Neither the site schema nor the contract has
discount codes today (there is an unrelated `offers` table). So this needs **a migration in the
`villa-booking` repo and a contract amendment**, not just Ooruda work.

**Split of this workstream:** the Ooruda half (definition, approval, ceilings, audit, redemption
read-back, reporting) is milestone M8 here. The `villa-booking` half is fully specified in that
repo's `TODO.md` under "Ooruda Villa integration — work owed by this repo", and is handled in a
**separate session**. M8 ships behind a feature flag and stays dark until the site side lands.

**Split of responsibility:**

- **Ooruda defines and approves** the code, and owns the audit trail.
- **The site enforces and counts** it, inside `create_booking_atomic`'s transaction. Anything else
  is a race: a `max_uses = 1` code hit by 50 concurrent checkouts will be honoured 50 times if the
  counter is read-then-written outside the lock.
- The site reports redemptions back; Ooruda shows usage and revenue impact.

**Guardrails against misuse — all of them enforced server-side on the site, not in the UI:**

| Guardrail | Why |
|---|---|
| `max_discount` cap in rupees alongside a percentage | stops "20% off" becoming ₹20,000 on a New Year booking |
| **Hard ceiling 25%.** A `villa_owner` can create codes up to 25%; anything above is saved as `pending_approval` and only a super-admin can activate it. Flat codes are held to the same ceiling against the minimum booking value. | prevents accidental revenue loss, and caps a compromised operator account |
| `valid_from` / `valid_to` | expiry |
| Blackout date ranges | protects peak nights |
| `min_nights`, minimum booking value | stops one-night arbitrage |
| `max_uses` total and `max_uses_per_guest` (by phone) | stops sharing on deal sites |
| Channel restriction — direct only | never let a code apply to an OTA-sourced booking |
| `stackable = false` by default | no compounding |
| Codes never apply retroactively to a confirmed booking | closes the "cancel and rebook" loop |
| Every create/edit/deactivate writes an `audit_logs` row with `created_by` / `approved_by` | accountability |
| Discount recorded as a discrete line, not by reducing `base_amount` | keeps GST taxable value correct |

That last one matters for §9: GST is charged on the **discounted** value, so the discount must be
applied before tax and shown as its own line on the invoice.

---

## 11. Multi-property: analysis and recommendation

You asked for the scenarios before deciding.

| # | Scenario | What it needs | v1.0? |
|---|---|---|---|
| S1 | One owner, one villa (Villa 19 today) | nothing extra | **yes** |
| S2 | One owner, 2–4 villas, one manager, combined P&L | `property_id` on every row; property switcher; per-property rates/calendar | **schema yes, UI switcher yes** |
| S3 | Management company running villas for *different* owners in one account | per-property ACLs inside an account — owner A must not see owner B's revenue | **no** |
| S4 | Each villa = its own Ooruda account | nothing extra, but no combined P&L, duplicated members/settings, and account-switching for every task | fallback |
| S5 | Selling individual rooms (homestay model) | availability granularity moves from property to room; the site's engine is whole-property | **confirmed for the future** — forward-compat only in v1.0 |

**Recommendation: multi-property in the schema from day one, single-property in the UI by default.**

- Adding `property_id` later to bookings, expenses, rates and invoices is a painful backfill plus an
  RLS rewrite. Adding it now costs one column and one index per table.
- The UI cost is the real cost, so v1.0 ships a property context (like the team switcher) that is
  **hidden when the account has exactly one property**. Zero added UX for Villa 19, no rework for
  the second villa.
- Each `villa_properties` row carries its own site connection (`site_project_ref`,
  `site_property_id`), so S2 works whether the villas share one booking-site project or each has its
  own. This is the flexibility that costs almost nothing now and is expensive to retrofit.
- **S3 is explicitly out of scope.** It is not "multi-property", it is multi-owner authorization, and
  it deserves its own design. Recorded in the TODO.
- **S5 is confirmed as a future requirement.** Villa 19 sells the whole property; a later villa
  will sell rooms. The expensive part lives in the `villa-booking` repo (the overlap predicate and
  `create_booking_atomic` move from property grain to room grain), and is specced in that repo's
  `TODO.md`. The cheap forward-compatibility we take **now**, in v1.0:
  - a `villa_rooms` table with `is_sellable_separately` (default false), so room inventory is
    described from day one and is not a later backfill;
  - `villa_bookings_mirror.room_scope` (`whole_property` | `rooms`), defaulted and constant today,
    so reports and invoices never have to be re-keyed;
  - the adapter's availability functions take an optional room set that is always null in v1.0,
    so call sites do not change shape when the site gains room grain.
  Nothing in v1.0 assumes one booking equals the whole villa except the UI copy, which is cheap to
  change.

The site's schema already supports many properties (`properties.slug`, `booking_code_prefix`, and
booking codes "unique across all villas"), so this direction is consistent with the villa repo too.

---

## 12. Milestones

Each ends with: `pnpm typecheck` → `pnpm lint:fix` → `pnpm format:fix` → `/reviewer` →
`supabase migration list --linked` → `./scripts/db-push.sh` → `RELEASE_NOTES.md`. Screens are driven
in a real browser at 360/768/1280 before being called done.

**M0 — Foundations (no user-visible change).**
`accounts.product_type` + backfill; guard the association auto-create trigger;
`create_villa_account()` RPC; `villa_owner` (10) / `villa_manager` (11) + permissions;
`villa_role()` helper; `requireRole(slug, roles, product)`; super-admin → `villa_owner` on villa
accounts; fix `filterSidebarConfigByRole` to deny unknown roles; product-keyed nav configs; extend
`assoc_admin_permissions`; super-admin panel product column + "Create villa account".
**Gate: the whole existing `apps/e2e/tests/ooruda/regression` suite passes unchanged.** M0 touches
shared auth code; nothing ships until it is green.

**M1 — Villa DB adapter.** `lib/villa-db/` client (server-only), **per-property credentials
resolved from Supabase Vault** via `villa_properties.site_credentials_ref`, generated
`villa-db.types.ts`,
`money.ts` rupee↔paise with tests, typed wrappers for `check_availability`,
`get_unavailable_nights`, `create_booking_atomic`, guarded confirm, cancel, blocks, pricing rules.
Port `normalizeBookingCode` from `src/lib/booking-code.ts` rather than reinventing it (contract
§5.7). `villa_sync_log`. Health check screen. No user features yet.

**M2 — Properties, rates, occupancy, add-ons.** `villa_properties` + onboarding, rates screen
(base / weekend / seasonal with the mandatory overlap check), occupancy and extra-guest settings,
`villa_addons`, emergency contacts. Owner-write, manager-read.

**M3 — Calendar, bookings, events.** Live calendar from `get_unavailable_nights`, month grid on
desktop and an agenda list at 360px, manual booking and event creation through
`create_booking_atomic`, date change as create-new-then-cancel-old (contract §5.4), owner-only
cancel with manager "request cancellation", `villa_bookings_mirror` + reconciliation cron, audit on
every transition.

**M4 — Guests and ID documents.** Guest master with E.164 dedupe via `normalizePhoneNumber`,
`villa-guest-docs` bucket and policies, soft-copy/hard-copy stages, masking, audited access,
retention sweep, `id_status` write-back, WhatsApp request link in the contract's exact format.
**Also in M4:** a villa section added to Ooruda's own Privacy Policy
(`app/[locale]/(legal)/privacy-policy/page.tsx`) covering guest identity documents — what is
collected, the lawful purpose, who can see it, where it is stored and for how long. This ships
**before** the upload feature is enabled, not after.

**M5 — Money.** Offline payment ledger with receipt numbering; **the full refund path of §9b** —
owner-only cancel with a mandatory reason, policy-derived refund amount with an audited override,
idempotent Razorpay Refunds API call, villa-DB mirroring per contract §7, credit note, date
release, guest email, and the daily Razorpay reconciliation report; `villa_expenses` + categories;
GST invoices and credit notes on the gapless per-FY `INV/26-27/NNNN` series; PDFs; dispatch.

**M6 — Reports and dashboards.** Occupancy, ADR, RevPAR, revenue vs expenses, channel mix, repeat
guests, FY + custom range, CSV/PDF export. Owner and manager dashboard variants.

**M7 — Automated emails.** Pre-arrival and post-checkout templates, cron scheduler, manual send,
`villa_message_log`.

**M8 — Discount codes (Ooruda half only).** Definition, platform ceiling and owner approval,
guardrails, audit trail, redemption read-back and revenue-impact reporting. Ships **behind a
feature flag, dark**, until the `villa-booking` half (atomic enforcement inside
`create_booking_atomic`) is delivered in its own session per that repo's `TODO.md`.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| M0 touches `requireRole`, the nav filter and an accounts trigger — every page depends on them | default arguments keep association behaviour byte-identical; full regression suite gates M1 |
| Villa account silently gets an `associations` row | trigger guard + a migration assertion that no `product_type='villa'` account has one |
| Service-role key for another project leaks | env var, server-only module, never a table column, never `NEXT_PUBLIC_` |
| Ooruda commits after a villa-DB write fails, or vice versa | authoritative write first, local commit second; `ooruda:<uuid>` markers + reconciliation sweep that reports, never auto-deletes |
| Mirror drifts and a report is wrong | mirror is derived-only and rebuildable; every screen shows "synced N min ago"; reconciliation by `updated_at` |
| **Refunds silently unrecorded** — the site's Razorpay webhook is **off** (contract §7) | Resolved in M5 per §9b: Ooruda owns the path end-to-end, idempotency key per refund, `initiated`→`processed` state so crashes are visible, daily Razorpay reconciliation, staff instructed to stop using the dashboard |
| Refund double-counted on retry or replay | discrete `villa_refunds` rows with `razorpay_refund_id` UNIQUE and a derived total — structurally impossible, unlike the existing `record_payment_reversal` accumulator bug |
| Vault secret for a villa project mis-scoped or leaked | per-property `site_credentials_ref`, resolved server-side only, never in a column or a `NEXT_PUBLIC_` var; local-dev override behind an explicit flag never set outside local |
| Guest ID retention period chosen wrongly | "for legal purposes" and the existing 7-day WhatsApp purge point in opposite directions — see §14 open item; `retention_days` is a per-property setting so the answer is a config change, not a migration |
| Room-level selling retrofit | `villa_rooms`, `room_scope` and an optional room set in the adapter are taken in v1.0 so the Ooruda side needs no backfill when the site gains room grain |
| "Paid but expired" bookings (guest closes the browser after paying) | contract §7 names this; build the Razorpay-vs-bookings reconciliation report in M5, not later |
| Overlapping pricing rules → guest quoted one price, charged another | the site enforces this only by convention; Ooruda does the overlap check *and* we propose a GiST exclusion constraint in the `villa-booking` repo |
| Discount code abused concurrently | counter incremented inside the site's booking lock; caps, ceilings and channel limits server-side |
| GST slab hardcoded wrong | rate is a per-property setting stored on the invoice; confirm slabs with the CA before implementing |
| Invoice series develops gaps | allocate the number only at issue; never at booking creation |
| Guest ID PII leak | private bucket, masked columns, short-TTL signed URLs, audited access, retention sweep, privacy notice updated first |
| Double-sent emails | `UNIQUE (booking_id, template)` |
| OTA propagation window double-booking | inherent; buffer-nights setting + collision alerting |
| Timezone drift | `todayInBillingZone()`; never `toISOString().slice(0,10)` (wrong between 00:00 and 05:30 IST) |
| Migration safety on a shared production DB | never `CREATE OR REPLACE` a security function without diffing; `CREATE INDEX CONCURRENTLY`; no ambiguous function overloads |
| Changes needed in two repos drift apart | every contract change updates `villa-booking/docs/OORUDA_VILLA_INTEGRATION.md` in the same PR cycle |

---

## 14. Decisions taken, and what is still open

### Settled

| # | Decision |
|---|---|
| 1 | **Money: rupees** `numeric(12,2)` throughout Ooruda; paise confined to `lib/villa-db/money.ts`. |
| 2 | **Availability authority: the villa-booking DB.** Ooruda writes through `create_booking_atomic` / `check_availability`, reserve-then-record. No outbox, no webhooks. |
| 3 | **Booking number: `booking_code` only** (`V19-7KQ-M4X`). `UV-YYMM-XXX` dropped. Statutory GST invoice series is separate — see §9. |
| 4 | **Refunds: Ooruda owns the path end-to-end** (§9b). The guest site's webhook stays off; the Razorpay dashboard is no longer used for villa refunds. |
| 5 | **Discount codes: split.** Ooruda defines and approves (M8, dark behind a flag); the site enforces and counts atomically — specced in the villa repo's `TODO.md`, separate session. |
| 6 | **Multi-villa is coming**, so per-property credentials via **Supabase Vault** from M1. |
| 7 | **Room-level selling is a future requirement.** Forward-compat taken in v1.0 (`villa_rooms`, `room_scope`, optional room set in the adapter); the grain change itself belongs to the villa repo. |
| 8 | **Multi-property in schema from day one**, property switcher hidden at one property. Multi-owner-in-one-account (S3) out of scope. |
| 9 | **Guest IDs stored in Supabase** for legal purposes, superseding WhatsApp-only. Ooruda's Privacy Policy gains a villa section in M4, shipped **before** uploads are enabled. |
| 10 | **Invoicing:** receipt voucher on advance, tax invoice at checkout, credit note on post-invoice cancellation or refund. |
| 11 | **Cancellation: owner-only and direct**, with a mandatory reason from a fixed list. No manager request-and-approve flow. |
| 12 | **Tenancy:** shared `/home/[account]` shell, product gate centralised in `requireRole`. |
| 13 | **`villa-booking` repo changes are out of this workstream** and are specced in that repo's `TODO.md`. |

### Settled on 2026-09-27

| # | Decision |
|---|---|
| 14 | Cancellation: owner-only by default; **`managers_can_cancel` switch**; mandatory reason from §9c plus free text; refund override owner-only. |
| 15 | Guest ID retention: **30 days** after check-out. |
| 16 | GST: SAC 996311; **5% up to ₹7,500 / 18% above**, per unit per night on actual value incl. extras after discount; CGST+SGST. |
| 17 | Discount ceiling **25%**; above needs super-admin approval. |
| 18 | **Managers** mark stays completed at check-out. |

### Settled on 2026-09-29

| # | Decision |
|---|---|
| 19 | **Invoice numbering: the villa-booking database is the single allocator** (`V19/26-27/INV/NNNNNN`, its `allocate_invoice_number`, added 2026-09-28 in `00038_gst_invoices.sql`). Ooruda issues invoices *through* it and never numbers invoices itself. This supersedes the `INV/26-27/NNNN` Ooruda series in §9. |
| 20 | **Tax invoice at check-out** (confirmed again): receipt vouchers for money received earlier, one tax invoice when the manager marks the stay completed. Requires the site's invoice trigger to fire on `completed` instead of confirmed+paid (villa-booking TODO 8c). |

### Still open

1. A one-line CA confirmation of §9 before the first live invoice. Not blocking the build.
