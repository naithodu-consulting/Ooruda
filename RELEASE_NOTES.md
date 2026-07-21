# Ooruda — Release Notes

This document covers all feature work, enhancements, and notable changes built on top of the Makerkit SaaS boilerplate. Makerkit upstream updates (framework, auth primitives, Supabase client, UI kit) are not detailed here.

---

## Foundation — Week 0 (Jun 13–18, 2026)

Initial project setup on top of Makerkit v3.4.1. This phase established the core domain schema, authentication model, and role system.

### Domain Schema

A complete PropTech domain was introduced via a single foundational migration (`20260612000000_ooruda_domain.sql`), establishing:

- **Associations** — the top-level entity (1:1 with a Makerkit team account); stores address, GSTIN, GST flag, electricity provider consumer number, brand color, logo URL, and status (Setup / Active / Suspended)
- **Units** — individual units within an association with type (Shop / Office / Warehouse), floor, area in sq.ft, owner assignment, and status
- **Tenancies** — tenant-to-unit assignments with start/end dates; one active tenancy per unit enforced by constraint
- **Sub-meters** — electricity sub-meters per unit (Unit or Common Area type)
- **Electricity bills** (initially "MESCOM bills") — monthly utility provider invoices with invoice amount, block consumption units, and effective rate
- **Meter readings** — per sub-meter readings linked to an electricity bill
- **Charge types** — configurable per-association charge definitions (electricity, maintenance, other charges) with calculation method (per sq.ft / flat / per unit / electricity), frequency, default payer, and GST flag
- **Bills** — generated billing documents per unit per period with total, paid amount, and status (Unpaid / Partial / Paid / Void)
- **Bill line items** — itemized rows within a bill
- **Payments** — payment records with mode, reference, and payer role
- **Receipts** — payment receipts with PDF URL
- **Audit logs** — structured event log (action, entity type, actor, metadata)
- **Notifications** — in-app notification log per user
- **Profiles** — extends auth users with full name and mobile number (phone OTP login identity)
- **Billing settings** — per-association defaults for electricity due day, maintenance due day, other charges due day, and reminder schedules

### Authentication

- **Phone OTP sign-in**: Replaced the standard email+password flow with a two-step phone → OTP flow. Uninvited phone numbers are blocked at the OTP send stage ("This phone number is not invited to any association")
- **Email OTP fallback**: Users invited by email can sign in via email OTP as an alternative path
- **Complete Profile screen**: Post-sign-in screen for phone-invited users to fill in their name and optionally link an email address
- **Admin-invite-only model**: Sign-up page removed; new users can only join via an association admin invite
- **SMS provider abstraction**: New `packages/sms` package with adapters for Mock (dev), MSG91, and 2Factor; routed via a Supabase Edge Function (`custom-sms-hook`)

### Role System (RBAC)

Four PropTech-specific roles introduced:

| Role | Description |
|---|---|
| `assoc_admin` | Full access to manage the association, members, billing, and settings |
| `billing_operator` | Can manage billing and electricity but cannot manage members or settings |
| `prop_owner` | Property owner — can view their unit bills and payment history |
| `tenant` | Tenant — can view their unit bills |

Roles are injected into the Supabase JWT via a custom access token hook (`propops_custom_access_token_hook`). A `requireRole()` server guard enforces access at the page level. Super admin (platform-level) bypasses association membership checks via `is_super_admin()`.

### Row-Level Security (RLS)

Initial RLS policies written for `associations`, `billing_settings`, and `charge_types`. All other tables secured in subsequent releases.

### Visual Design & Layout

- Dark amber sidebar theme (oklch-based color tokens)
- Custom Ooruda brand: `OorudaMark` SVG component, full favicon set, OG image, Safari pinned tab icon, `site.webmanifest`
- Branded email templates: OTP email and change-email-address email (amber styling, Ooruda mark, legal footer)
- Sidebar navigation filtered by role (items hidden based on user's role in the current association)
- `MetricCard` UI primitive: reusable KPI card with title, value, trend indicator, and icon
- `ComingSoonState` UI primitive: placeholder component for pages not yet built
- Association dashboard built on real Supabase data (INR formatting, zero-state handling)
- `format-inr.ts`: Indian Rupee formatting utility
- `format-date.ts`: Timezone-aware date/datetime/period formatters for Indian timezone (IST)
- `format-period.ts`: Formats `YYYY-MM` period strings to human-readable labels (e.g. "June 2026")

### Infrastructure

- `packages/sms` monorepo package with provider abstraction layer
- `DEPLOYMENT.md`: deployment instructions for production
- `README.md`: developer guide (local setup, role system, architecture, testing)
- Super admin redirect to `/admin` (prevents landing in the wrong UX flow)
- Super admin MFA relaxed for platform-level accounts

### Testing Infrastructure

- **E2E (Playwright)**: Phone OTP auth flow, email OTP auth flow, association settings page
- **Unit tests (Vitest)**: `rbac.ts` guard logic, `updateAssociationAction` server action
- **Database tests (pgTAP)**: Schema integrity and constraints, role hierarchy and permissions, RLS policies
- `TESTING.md`: 146-line developer testing guide

---

## Release v1.0 — Week 1 Core Features (Jun 21–26, 2026)

Branch: `week-2`

This release delivered all major property management features: units and tenancy management, electricity metering, billing generation, payments, audit logs, admin panel, and dashboard data.

### Association Settings

- General info card: name, address, GSTIN
- MESCOM/electricity card: consumer number
- Tax card: GST toggle, GSTIN field
- Billing defaults card: per-charge-type due days (electricity, maintenance, other charges)
- Charge types card: toggle active/inactive per charge type; set calculation method (per sq.ft ↔ per unit) for maintenance
- Association logo uploader with preview
- Custom RLS UPDATE policy allowing `assoc_admin` and `billing_operator` to update their own association record

### Units & Owners

- Units list with columns: unit number, type, area, floor, owner, current tenant, status
- Add Unit dialog (unit number, type, floor, area) with Zod validation
- Edit Unit dialog:
  - Edit unit details (number, type, floor, area)
  - Assign/change owner from association members
  - Assign tenant and set tenancy start date
  - End active tenancy
- CSV bulk import of units (preview, column mapping, validation)
- Unit deletion restricted to super admin only (via RLS and server action)
- **Unit detail page** (`/home/[account]/units/[unitId]`): shows unit info, current owner/tenant, and full tenancy history as a vertical timeline with occupancy periods, vacancy gaps shown as dashed segments
- `Common Area` unit type added (no area field required, special billing treatment)

### Electricity (MESCOM Billing)

- Sub-meters management: add/deactivate sub-meters per unit; meter label, type (Unit or Common Area), active status
- Add electricity bill: upload monthly invoice with invoice amount and block consumption units
- Bill readings dialog: enter/edit per-meter readings for a bill; previous reading pre-filled from last recorded reading; minimum charge pre-filled from previous period (carry-forward)
- CSV bulk import of meter readings with preview and upsert
- Block rate display per bill (invoice ÷ block units)
- Metered units total per bill (sum of all sub-meter consumption)
- Delete electricity bill (restricted to super admin only; cascade-deletes all meter readings)
- RLS policies for `mescom_bills` and `meter_readings` (read: assoc members; write: assoc_admin + billing_operator; delete: super admin only)

### Billing

- **Generate Bills**: Generate billing documents for a selected period and charge type (maintenance, electricity, other charges)
- Bill list with period, charge type, total, paid amount, status, and line items
- Bill line items dialog: itemized breakdown per bill
- Void bill action
- **Other Charges**: Add ad-hoc charges before bill generation via `pending_other_charges` staging table; supports flat or per-sq.ft split across units; CSV bulk import
- Import Other Charges dialog: bulk CSV import with per-unit or association-wide split mode
- Billing filters: period, status, bill type, unit
- Per-charge-type due days (electricity, maintenance, other charges as separate fields)
- **Transactional consistency** (via Postgres RPCs):
  - `record_payment()` RPC: atomic payment recording (validates bill, checks overpayment, creates payment + receipt in one transaction)
  - `sync_bill_payment_status()` trigger: auto-updates `bills.paid_amount` and `bills.status` on every payment change; eliminates manual status sync in application code
  - `generate_bills()` RPC: bill generation moved to a database function for atomicity

### Payments

- Payments list with period, unit number, bill number, total, outstanding, and status
- Record Payment dialog: enter payment mode (cash / bank transfer / UPI / cheque), amount, and reference number
- Payment history dialog: view all payments recorded against a specific bill
- Payments filters: period, status, bill type
- Bill status badges: Unpaid (yellow), Partial (orange), Paid (green), Overdue (red)

### PDF Generation

- New `packages/pdf-templates` monorepo package using `@react-pdf/renderer`
- Bill PDF: Ooruda header with mark and association name/address, itemized line items table, GST breakdown (CGST + SGST), totals; cached per bill (URL stored in `bills.pdf_url`)
- Receipt PDF: payment confirmation with Ooruda header and payment details
- PDFs invalidated automatically when payments change (Postgres trigger nullifies `bills.pdf_url`)
- Private `billing-documents` Supabase Storage bucket with path-scoped RLS (`bills/{association_id}/{bill_id}.pdf`)
- Download PDF button with async generation and browser save

### Reports

- Arrears summary section: units with outstanding balances
- Payment summary section: payments collected in a period
- Billing overview section: bills generated vs. paid vs. outstanding
- Reports accessible to `assoc_admin`, `billing_operator`, and `prop_owner` (own data only)

### Audit Logs

- Audit log page with structured event cards (action type, entity, actor, timestamp)
- `logAuditEvent()` shared helper used by all server actions
- Filters: entity type filter

### Notifications

- Notifications page showing in-app notification log per user
- Card UI per notification with read/unread state
- Filter: read/unread

### Admin Panel Enhancements

- **Create Association dialog**: admin-side dialog to create a new association/team account (name, slug, address)
- **Create User dialog**: creates a user with full name, phone number, and role; uses Supabase admin API to create a phone-confirmed user
- **Edit User dialog**: edit user name, phone, linked email, and role from admin panel
- **Manage Roles dialog**: set/change member roles across associations
- **Remove Member dialog**: remove a member from an association
- **Association Permissions card**: per-association feature flags (`can_invite_members`, `can_manage_billing`, `can_view_reports`, etc.) configurable from the admin panel; stored in `assoc_permissions` table; scoped to super admin
- Delete Team Account moved to a Danger Zone section
- Per-row action menus in the admin members table

### Invitations

- Role-restricted invitations: `assoc_admin` can only invite `prop_owner` and `tenant`; super admin can invite any role
- Phone-based invitations: `invite_to_association_by_phone` RPC with conflict-safe implementation
- Invitation records now store `invitee_name` and `email` so they survive through the sign-in flow
- Invite members dialog captures name and email for phone-invited users
- `PhoneInput` component: international phone input with libphonenumber-js validation, country selector, E.164 output
- Phone number normalization: all numbers stored in E.164 format; backfill migration for existing records

### Dashboard

- Real Supabase data aggregates: total units, active tenancies, outstanding bills, recent payments
- Multi-unit summary card: per-unit billing status for the current period
- Recent activity section: chronological list of audit events with entity badges
- Metric cards for: total units, total members, monthly billing generated, total collected

### Utilities

- `billing-dates.ts`: period calculation utilities (current period, billing cycle dates, due dates)
- `bill-status.ts`: bill status badge class and label helpers
- `person-label.ts`: consistent owner/tenant name formatting from profile records
- `unit-access.ts`: shared authorization logic for unit access checks

---

## Release v2.1 — Polish & Infrastructure (Jun 26–29, 2026)

Branch: `release/v2.1`

This release focused on mobile responsiveness, branding, layout polish, and infrastructure setup. No major new features.

### Branding Rename

All "PropTech" product references replaced with "Ooruda" across: environment files, auth layouts, i18n messages, email templates, sidebar, app manifest, migrations, tests, and documentation.

### Layout & Navigation

- **Admin topbar** (`AdminTopbar`): new topbar component for all `/admin/*` routes with Ooruda mark, breadcrumbs, and user dropdown (name, phone, sign out)
- **Team account topbar**: polished with breadcrumbs, mobile menu toggle, user avatar, and user dropdown
- **Sidebar footer**: slimmed down across both team account and admin sidebars; scrollbars hidden on all sidebar scrollable areas
- **Association switcher**: moved to the top of the sidebar header section
- Active sidebar navigation items now show correct highlighted state
- Sticky topbar fixed on mobile scroll
- `useSidebar` context error resolved

### Mobile Responsiveness

Mobile layout improvements applied across all core pages:

- Dashboard: responsive grid breakpoints
- Billing: table collapse on narrow screens
- Payments: responsive layout
- Electricity / Sub-meters: mobile column hiding
- Units table: mobile column hiding
- Admin panel: improved mobile layouts

### Email OTP Configuration

- Email OTP fully configured and documented (`EMAIL_AUTH_SETUP.md`)
- Branded OTP email template: amber styling, Ooruda mark, legal footer
- Branded change-email-address email template

### Monitoring

- Sentry monitoring package added to the monorepo infrastructure

### Developer Experience

- Error boundary for the electricity route (user-friendly error UI instead of crash)
- Removed redundant `revalidatePath()` calls in server actions (were causing unnecessary full-page reloads)
- `alert-dialog.tsx` added to `packages/ui` and exported from `@kit/ui/alert-dialog`
- `AGENTS.md` updated with project context for AI coding assistants

---

## Release v3.0 — Week 3 Part 1 (Jun 29–Jul 1, 2026)

Branch: `week-3-part-1`

### Tenancy Timeline

- Unit detail page now shows a complete tenancy history as a vertical timeline
- Each occupancy period displays: owner, tenant, start date, end date
- Vacant periods shown as dashed/inactive segments between occupancies

### Electricity: Per-Reading Minimum Charge

- Minimum electricity charge moved from an association-wide setting to a per-meter-reading field
- When adding/importing meter readings, the previous period's minimum charge is automatically carried forward as the default
- Import Meter Readings CSV dialog now carries forward minimum charges per sub-meter

### Billing: Other Charges

- `pending_other_charges` staging table: store ad-hoc charges before bill generation
- Other charges can be: per unit (flat amount) or association-wide (split flat or per sq.ft across all units)
- Add/view/delete pending other charges per period via the Other Charges dialog
- Import Other Charges via CSV bulk import dialog (preview, validation, per-sqft or flat split mode)
- Charges are consumed during `generateBillsAction` for the "other charges" bill type

### Billing: Common Area Support

- `Common Area` added as a unit type (no area required)
- Common area units can have their own electricity sub-meters and appear in billing
- Bill generation handles common area units separately from residential/commercial units
- Billing list displays common area bills with appropriate labeling

### Billing: Filters & UX

- Period filter, status filter, bill type filter, and unit filter added to the billing page
- Dynamic Indian Financial Year labels: "FY 2026-27" / "FY 2025-26" (calculated automatically from April–March cycle; auto-updates each year)
- Bill generation period picker restricted to past and current months only (future months no longer offered)
- "Settings saved." persistent banner replaced with auto-dismissing toast notification
- Dropdown filters (status, type, duration) now show human-readable labels immediately on mount (previously showed raw database values like `current_month`)
- Generate Bills confirmation now inline in the same dialog (previously opened a second overlapping dialog)

### Payments: Filters

- Period, status, and bill type filters added to the payments page
- Per-period grouping of bills in the payments list

### Charge Types: Maintenance Method

- Maintenance charge type now supports two calculation methods: per sq.ft and per unit
- Togglable from Association Settings → Charge Types card
- Method stored per association and applied during bill generation

### Super Admin: Deep-Linking & Visibility

- Super admin can now navigate directly to any association workspace via URL (deep-link) without being a member
- Owner and tenant names now display correctly in the Edit Unit dialog when accessed via super-admin deep-link (RLS `profiles_read_account_members` policy updated)
- `create_profile_on_signup` trigger fixed to copy `invitee_name` from invitation records into `profiles.full_name` for brand-new phone-invited users; includes expiry filter and deterministic tie-break for multiple matching invitations

### Security Hardening

- Electricity bill deletion restricted to super admin at both server action and RLS policy levels (`restrict_mescom_bill_deletion` migration)
- Unit deletion restricted to super admin at both server action and RLS policy levels
- `profiles` table RLS updated: super admins can read all profiles (required for workspace deep-linking)
- Invite name backfill fixed: expired invitations no longer donate names to newly signed-up users

### Shared Utilities

- `apps/web/lib/bill-filter-items.ts`: consolidated dropdown label maps for billing, payments, and electricity filters (eliminates duplication)
- `apps/web/lib/financial-year.ts`: current and previous Indian Financial Year label utilities

---

## Release v3.1 — GST, Bulk Invite & Performance (Jul 2–12, 2026)

### Billing: GST Support

- **GST-inclusive bill generation**: When GST is enabled at the association level, generated bills now include the GST amount in the payable total. Electricity is excluded (pass-through billing); maintenance and other charges are taxable by default.
- **Per-charge-type GST control**: The Charge Types card in Association Settings shows a GST toggle per charge type (visible only when association GST is enabled), allowing admins to mark individual charge types as taxable or exempt.
- **Bill breakdown popup**: View Breakdown now shows subtotal, CGST, SGST, and GST-inclusive total as a compact summary below the line items.
- **PDF bill updated**: Shows subtotal, CGST and SGST lines, and a GST-inclusive "Bill Amount (Payable)" when applicable.

### Association: Registration Number

- New **Registration Number** field on the association, editable in Billing Settings.
- Printed in the PDF header on both bills and receipts, below the address and above the GSTIN.

### Owner/Tenant: Self-Service Razorpay Payments

- **Per-association Razorpay credentials**: Each association has its own Razorpay Key ID and Key Secret stored in a new `association_payment_gateways` table. Credentials are server-only (no authenticated RLS policy — service role only) and the secret never reaches the client.
- **Super admin gateway config**: Admin → Accounts → [Association] now has a "Payment Gateway" card. Super admin enters/updates Key ID, Key Secret, optional Webhook Secret, and toggles active status. Editing with blank secret preserves the existing secret.
- **"Pay ₹X" per bill**: When the association has an active gateway, `prop_owner` and `tenant` see a "Pay ₹X" button on each unpaid/partial bill row in the Payments page.
- **"Pay All — ₹Y" button**: If multiple bills are pending, a single "Pay All" button appears at the top. It creates one Razorpay order for the total outstanding and settles each bill individually after payment verification.
- **Secure checkout flow**: `POST /api/billing/razorpay/create-order` creates the order server-side using the association's key; `POST /api/billing/razorpay/verify` verifies the HMAC-SHA256 signature before calling `record_payment()` for each bill.
- **Batch grouping**: Multi-bill payments share a `payment_batch_id` UUID for future grouped reporting.
- **Duplicate payment protection**: Composite unique index `(razorpay_payment_id, bill_id)` prevents double-recording a payment for the same bill.
- **Page auto-refresh**: After successful payment, `router.refresh()` is called so bill statuses update immediately without manual reload.
- **Extensible design**: `provider` column in gateway table and `payment_batch_id` are forward-compatible with future gateways (PayU, CCAvenue) and batch reporting.

### Admin: Bulk CSV Member Invite

- Super admins can now invite members in bulk via CSV upload from the Admin → Accounts page.
- Three-step flow: upload CSV → preview parsed rows → view import results.
- CSV format: `phone, name, email, role, association_name` — all columns mandatory. Invalid or incomplete rows are skipped with a reason shown in the results.
- A downloadable CSV template is provided in the dialog.

### Billing & Payments: Instant Filters

- Filter dropdowns (payment status, bill type, duration) now update results instantly with no server round-trip. Metrics (count, collected, outstanding, overdue) also update in real time as filters change.

### PDF Downloads: Performance

- Cached bill and receipt PDFs now download near-instantly. The download button shows a loading indicator while a PDF is being generated.

### Electricity: Correct Block Rate Denominator

- Electricity block rate is now computed as `invoice_amount ÷ mescom_bill.block_consumption_units` (the units on the MESCOM invoice itself), not the sum of individual sub-meter readings. This is the correct formula per MESCOM billing.
- Minimum charge per sub-meter reading is now included in the electricity bill amount (`minimum_charge + block_rate × consumed_units`).

### Dashboard: Accurate "Amount Due" for Multi-Bill Units

- The owner dashboard now sums outstanding amounts across **all** bills for the current period (electricity + maintenance + other charges) rather than showing only the most recently generated bill's outstanding balance.

### Association Settings: Page Load

- Billing Settings page now loads significantly faster — database queries are parallelised and a loading spinner is shown while the page fetches data.

---

## Release v4.0 — Razorpay Self-Service Payments & Unit-Scoped Pay All (Jul 3, 2026)

Branch: `week-4`

### Self-Service Online Payments (Razorpay)

- **Per-association Razorpay gateway**: Super admins configure `key_id`, `key_secret`, `webhook_secret`, and toggle active/inactive per association in Admin → Accounts → [Association] → Payment Gateway card. Credentials are stored server-side only — `key_secret` is never sent to the client.
- **Pay individual bill**: `prop_owner` and `tenant` see a "Pay ₹X" button on each unpaid/partial bill in the Payments page. Clicking opens the Razorpay checkout modal (UPI, card, netbanking, etc.).
- **Pay All Pending**: When a specific unit tab is selected and there are 2+ pending bills, a "Pay All — ₹X" button appears in the card header. This creates one Razorpay order covering all pending bills for that unit; each bill gets a separate payment record linked by a shared `payment_batch_id`.
- **Unit-scoped Pay All**: Multi-unit owners see unit tab pills (All Units / Unit 404 / Unit A2). "Pay All" is only available when a specific unit is selected, never cross-unit. Single-unit owners/tenants see no extra UI complexity.
- **Dashboard "Pay now"**: Now links to `/payments?unit=<unit_no>`, auto-selecting the correct unit tab on arrival.
- **Security**: Both `/api/billing/razorpay/create-order` and `/api/billing/razorpay/verify` resolve the caller's owned/rented unit IDs and scope all bill queries to those units. Admins and billing operators are blocked from these endpoints (they use the manual Record Payment flow instead).
- **Duplicate protection**: Composite unique index on `(razorpay_payment_id, bill_id)` prevents duplicate payment records; the verify route skips `23505` conflicts gracefully.
- **Modular gateway design**: `provider` column in `association_payment_gateways` allows future gateways (PayU, CCAvenue) without schema changes.

### Payments Page UX

- **Client-side filtering**: All bill data is loaded once; status, type, and duration filters apply instantly in-memory (no server round-trip per filter change).
- **Unit tab pills**: Visible only for prop_owner/tenant with 2+ units. Scopes the bill table and Pay All to the selected unit.
- **Live metrics strip**: Bill count, collected, outstanding, and payment count update instantly as filters change.

---

## Release v3.5 — Door Number, Electricity Load & Ooruda Branding (Jul 14, 2026)

### Units: Door Number Field

- Optional `door_no` column added to `units` table.
- Editable in Add Unit and Edit Unit dialogs.
- Included as an optional `door_no` column in the units CSV import template; shown in the preview table.
- Door number appears on electricity bills, maintenance bills, and payment receipts (if set) — shown beneath the unit number.

### Electricity: Sub-meter Sanctioned Load (kVA)

- Optional `load_kva` column added to `sub_meters` table.
- Editable in Add Sub-meter dialog (new "Sanctioned Load (kVA)" field).
- Shown in the sub-meters table as a "Load (kVA)" column.
- Included as optional `load_kva` column in the sub-meters CSV import template; shown in the preview table.
- If any sub-meter has a load value, a note is shown below the electricity bill PDF's meter readings table: "Sanctioned Load — SM-1: 2.5 kVA | SM-2: 3.0 kVA", helping customers understand the basis for minimum charges.

### Association Settings: Sanctioned Association Load (kVA)

- Optional `sanctioned_load_kva` column added to `associations` table.
- New "Sanctioned Load (kVA)" field in the Electricity card of association settings.
- Stored for future calculations (not shown on individual bills).

### Bills & Receipts: "Generated from Ooruda" Footer

- All bill PDFs (maintenance, other charges) and payment receipts now show "Generated from [Ooruda](https://ooruda.com/)" as a clickable hyperlink in the footer.
- Electricity bill PDF updated to match (was previously using its own inline footer).

---

## Release v3.3 — Electricity Enhancements & Dashboard Improvements (Jul 3, 2026)

### Electricity: Due Date Fixed to Next Month

Electricity bills are now due in the calendar month AFTER the billing period (e.g. July electricity bill is due in August). Previously, the due date was calculated within the same billing month.

### Electricity: Billing Period Date Range

"Add Electricity Bill" dialog now includes Period Start and Period End date pickers (default: first and last day of the selected month). Stored in a new `period_start`/`period_end` column pair on `mescom_bills`. The electricity bill PDF uses these dates to display the exact billing period range.

### Electricity: Redesigned Bill PDF

Electricity bill PDFs now use a purpose-built format:
- Header: association name + address
- Title: "ELECTRICITY CHARGES"
- Addressee block (unit + association) alongside bill metadata (Month, Period, Date, Due Date, Bill No)
- Per-sub-meter table showing previous/current/consumed readings, block rate, and amount
- Minimum charge row (when applicable)
- Grand total
- Configurable authorised signatory name at the bottom

### Association Settings: Authorised Signatory

Associations can now configure an "Authorised Signatory" name (e.g. "John Doe, Secretary") shown on electricity bill PDFs. Field added to the Electricity card in association settings.

### Dashboard: Duration Filter

Admin association dashboard now has a duration selector (Current Month / Last Month / Last 3 Months / Last 6 Months / FY labels / All Time) that filters all billing metrics for the selected window. Defaults to Current Month.

### Dashboard: Clickable Metric Tiles

All four admin metric tiles (Billed, Collected, Outstanding, Overdue) are now clickable and navigate to the billing or payments page with the matching duration and status filter pre-applied.

### Dashboard: Improved Owner Amount Due

Owner dashboard "Amount Due" now aggregates outstanding across ALL unpaid/partial bills across ALL periods, with per-period breakdown, worst-case status (Overdue vs Unpaid), and quick-action links to pay by bill or pay all outstanding.

### Electricity: Sub-meter CSV Import (Super Admin only)

- **Bulk import sub-meters via CSV** — new "Import Sub-meters" button visible only to super admins in the Sub-meters section.
- CSV columns: `unit_no`, `sub_meter_no`, `meter_type` (`Unit` or `CommonArea`).
- Existing sub-meters are skipped (no overwrite); duplicates within the same batch are deduplicated.
- CommonArea meters use the alphabetically-first unit as FK anchor (deterministic across imports).
- Insert uses admin client to bypass RLS, consistent with other super-admin operations.
- Preview table + skipped-rows result view, same UX as meter readings import.

### Electricity: Meter Readings CSV — Optional Previous Reading & Minimum Charge

- `previous_reading` and `minimum_charge` columns added to the meter readings CSV as **optional overrides**.
- If blank, zero, or non-numeric — existing/derived values are used (no behaviour change for current CSVs).
- If a valid number > 0 is supplied — that value is used, enabling bulk test data uploads with explicit values.
- Template and preview table updated to show the new columns.

### Audit Log: Search & UX Improvements

- **Instant search** — debounced as-you-type (300ms) across event name, details, and actor name; results update without pressing Enter.
- **Actor name search** — searches profiles via admin client so super-admin actors resolve correctly; name-matched user IDs are passed as a typed `.in()` filter.
- **Super Admin badge** — actors not in the account's membership (super admins) now show a red "Super Admin" role badge instead of a dash.
- **Column renames**: Action → Event, Actor → User, Entity → Details, Timestamp → Date.
- **Truncated error details**: Long error messages trimmed to 90 characters; raw JSON payloads replaced with "An error occurred."
- **Corrected action labels** — all label keys now match exact DB action values (`mescom_bill.created`, `bills.generated`, `meter_readings.recorded`, etc.) covering all success and failure variants.
- **Wording fix** — audit summary for electricity bill creation changed from "Uploaded Electricity bill" to "Added electricity bill".

### Electricity Bill PDF: Redesign

- **Association logo** — shown in the header via the shared `DocumentHeader` component (falls back to Ooruda mark if no logo set).
- **Association address** — included in the header.
- **Navy colour scheme** — professional deep navy (`#1a3a5c`) for title strip, table header, and total row; replaces the previous bright blue.
- **SL column** and alternating row shading added to the meter readings table.
- **Minimum charge row** — amber-tinted to visually distinguish it.
- **Receiver's Signature + Authorised Signatory** — both signature blocks shown side by side at the bottom, matching the standard bill format.

---

## Release v3.2 — GST, Bulk Invite & Electricity Reconciliation (Jul 3, 2026)

### GST Support

- **Association-level GST toggle**: Enable GST for the entire association via Settings → Association → GST Enabled. Set GSTIN and GST rate (%).
- **Per-charge-type GST flag**: Each charge type has an independent "GST applicable" toggle. Electricity is always excluded (pass-through billing). Maintenance and other charges default to enabled when association GST is on.
- **GST inclusive billing**: When GST is enabled and applicable to a line item, `gst_amount` is stored on the bill. The bill breakdown popup shows subtotal, CGST + SGST split, and GST-inclusive total.
- **PDF updates**: Bill PDF shows a GST column per line item and a summary block with CGST/SGST rates and amounts.

### Association Settings

- **Registration number**: Associations can now store an official registration number; shown in PDF headers.
- **Charge Types card improvements**: Column headers (GST / Active) added; both toggles are now `Switch` components (consistent UI); electricity shows a dash with tooltip instead of a GST toggle.
- **Billing Settings parallelisation**: Settings page queries now run with `Promise.all` instead of sequentially — reduces page load time.
- **Loading state**: `loading.tsx` added to the association settings route for a spinner during navigation.

### Super Admin: Bulk Member Invite

- **CSV bulk invite**: Super admins can upload a CSV (`name`, `phone`, `role`) to create and invite multiple users at once. Name is mandatory. Invalid rows are skipped with per-row error reporting.
- **Pre-built phone→user map**: User lookup is now done with a single paginated scan of `auth.users` before the import loop (instead of per-row calls), fixing a bug where only the first 50 users were checked.

### Electricity: Adjusted Block Rate

- **Proportional transmission-loss recovery**: The effective electricity rate is now computed as `invoice_amount ÷ sum_of_all_sub_meter_units` (instead of MESCOM's `block_consumption_units`). This ensures the full MESCOM invoice is recovered every month, with transmission losses shared proportionally across all units. No carry-forward reconciliation needed.

---

## Migrations Changelog

| Migration | Date | Description |
|---|---|---|
| `20260612000000_ooruda_domain.sql` | Jun 12 | Full PropTech domain schema (17 tables) |
| `20260614000001_proptech_permissions.sql` | Jun 14 | Custom permissions for units, payments, reports |
| `20260614000002_proptech_roles.sql` | Jun 14 | PropTech roles, JWT hook, role migration |
| `20260614000003_proptech_rls.sql` | Jun 14 | RLS for associations, billing_settings, charge_types |
| `20260617000001_super_admin_no_mfa.sql` | Jun 17 | MFA relaxed for super admin |
| `20260618000001_phone_invitations.sql` | Jun 18 | Phone-based invitation RPC |
| `20260618000002_nullsafe_protect_account_fields.sql` | Jun 18 | Null safety guards on account fields |
| `20260621000000_accounts_settings_manage_update.sql` | Jun 21 | Custom RLS UPDATE policy for association settings |
| `20260622000000_units_write_policies.sql` | Jun 22 | INSERT/UPDATE/DELETE RLS for units |
| `20260623000000_tenancies_write_policies.sql` | Jun 23 | RLS for tenancies |
| `20260623000001_fix_invite_on_conflict.sql` | Jun 23 | Fix ON CONFLICT error in phone invite RPC |
| `20260624000000_mescom_write_policies.sql` | Jun 24 | RLS for mescom_bills and meter_readings |
| `20260625000000_billing_write_policies.sql` | Jun 25 | RLS for bills and bill_line_items |
| `20260626000000_payments_write_policies.sql` | Jun 26 | RLS for payments and receipts |
| `20260627000000_audit_logs_write_policy.sql` | Jun 27 | INSERT-only policy for audit_logs |
| `20260628000000_transactional_billing_payments.sql` | Jun 28 | `record_payment()` RPC, `sync_bill_payment_status()` trigger |
| `20260628000001_assoc_admin_permissions.sql` | Jun 28 | `assoc_permissions` table and RLS |
| `20260628000002_normalize_profile_phone_numbers.sql` | Jun 28 | E.164 phone number normalization backfill |
| `20260629000000_profiles_email.sql` | Jun 29 | `email` column on profiles |
| `20260630000000_invite_name_email.sql` | Jun 30 | `full_name` and `email` on invitation records |
| `20260701000000_mescom_delete_policies.sql` | Jul 1 | DELETE RLS for mescom_bills and meter_readings |
| `20260629095841_add_minimum_charge_to_meter_readings.sql` | Jun 29 | Per-reading minimum charge column |
| `20260629102420_billing_settings_drop_min_elec_charge.sql` | Jun 29 | Move min charge from billing_settings to per-reading |
| `20260702000000_other_charges.sql` | Jul 2 | `pending_other_charges` table, rename penalty → other_charges |
| `20260703000000_meter_readings_unique_constraint.sql` | Jul 3 | Unique constraint for bulk upsert on meter_readings |
| `20260704000000_billing_pdf_documents.sql` | Jul 4 | PDF URL columns, billing-documents storage bucket |
| `20260705000000_fix_seed_charge_types_search_path.sql` | Jul 5 | Search path fix in seed trigger |
| `20260706000000_invalidate_bill_pdf_on_payment_change.sql` | Jul 6 | Trigger to nullify PDF URL on payment change |
| `20260706000001_restrict_pending_other_charges_read.sql` | Jul 6 | Tighten RLS for pending_other_charges |
| `20260701000001_separate_bills_and_common_area.sql` | Jul 1 | Common Area unit type, per-type due days, relax bills unique constraint |
| `20260707000000_restrict_unit_deletion.sql` | Jul 7 | Restrict unit DELETE to super admin |
| `20260708000000_super_admin_association_access.sql` | Jul 8 | Super admin workspace deep-linking RLS bypass |
| `20260709000000_fix_claim_invite_full_name.sql` | Jul 9 | Fix profile full_name population from invite on signup |
| `20260710000000_super_admin_profiles_read.sql` | Jul 10 | Super admin can read all profiles |
| `20260711000000_restrict_mescom_bill_deletion.sql` | Jul 11 | Restrict electricity bill DELETE to super admin |
| `20260712000000_fix_invite_name_backfill_expiry.sql` | Jul 12 | Fix invite name backfill: expiry filter + deterministic tie-break |
| `20260712000001_drop_old_invite_overload.sql` | Jul 12 | Drop stale 4-arg overload of `invite_to_association_by_phone` (fixes HTTP 300) |
| `20260712000002_fix_invite_on_conflict_partial_index.sql` | Jul 12 | Fix ON CONFLICT predicate to match partial unique index (fixes HTTP 400) |
| `20260712000003_bills_bill_type.sql` | Jul 12 | Add `bill_type` column to bills, backfill, add composite indexes |
| `20260712000004_create_bill_with_items_bill_type.sql` | Jul 12 | Update `create_bill_with_items` RPC to accept and store `bill_type` |
| `20260702000001_bills_gst_amount.sql` | Jul 2 | Add `gst_amount` column to `bills`; update `create_bill_with_items` to accept and store `p_gst_amount` |
| `20260702000002_associations_registration_number.sql` | Jul 2 | Add `registration_number` column to `associations` |
| `20260702000004_razorpay_gateway.sql` | Jul 2 | `association_payment_gateways` table; add `razorpay_order_id`, `payment_batch_id` to `payments`; update `record_payment()` RPC to support owner/tenant Razorpay payments |
| `20260702000003_charge_types_gst_applicable_defaults.sql` | Jul 2 | Fix `gst_applicable` defaults: maintenance + other_charges → `true`, fix seed trigger |
| `20260703000001_drop_old_record_payment_overload.sql` | Jul 3 | Drop stale 5-arg overload of `record_payment` (fixes PGRST203 ambiguity with Razorpay 8-arg overload) |
| `20260713000000_mescom_bills_period_dates.sql` | Jul 13 | Add `period_start` and `period_end` DATE columns to `mescom_bills` for exact billing period range on electricity PDFs |
| `20260713000001_associations_authorised_signatory.sql` | Jul 13 | Add `authorised_signatory` TEXT column to `associations` for electricity bill PDF signature block |
| `20260714000000_door_no_load_kva.sql` | Jul 14 | Add optional `door_no` TEXT to `units`, `load_kva` NUMERIC to `sub_meters`, `sanctioned_load_kva` NUMERIC to `associations` |
| `20260715000000_bill_sequences.sql` | Jul 15 | `bill_sequences` table + `allocate_bill_no()` RPC for FY-scoped, per-type atomic bill number allocation |
| `20260715000001_billing_entity_fields.sql` | Jul 15 | Add `bill_to`, `owner_is_company`, `owner_company_*` to `units`; `is_company`, `company_*` to `tenancies`; `pan_number` to `associations` |
| `20260716000000_sub_meters_initial_reading_min_charge.sql` | Jul 16 | Add `initial_reading` and `minimum_charge` columns to `sub_meters` for onboarding baseline and default monthly charge |
| `20260716000001_super_admin_account_write_access.sql` | Jul 16 | Add `is_super_admin()` bypass to `accounts_settings_manage_update` policy and `account_image` storage policy so super admins can save association name and logo |
| `20260716000002_get_user_id_by_phone.sql` | Jul 16 | Add `get_user_id_by_phone` and `get_user_id_by_email` service-role functions for bulk-invite conflict recovery |
| `20260716000003_find_users_by_phones_or_emails.sql` | Jul 16 | Add `find_users_by_phones_or_emails` batch function for comprehensive auth.users lookup by phone AND email in bulk invite |
| `20260707122210_test_flags_and_rename_test_data.sql` | Jul 7 | Add `is_test` to `associations` and `profiles`; rename Abish → Sandbox Residency, Prestige Meadows → Demo Towers; tag 11 test users |
| `20260707132123_sync_test_user_account_names.sql` | Jul 7 | Sync `accounts.name` from `profiles.full_name` for all test users (display name fix) |
| `20260708000001_unit_status_self_occupied_rented.sql` | Jul 8 | Drop `Occupied` CHECK; migrate existing rows; add CHECK for `Self Occupied`, `Rented`, `Vacant` |
| `20260709000001_meter_readings_load_kva.sql` | Jul 9 | Add nullable `load_kva` column to `meter_readings` for per-reading tracking |

---

## Release v3.6 — Continuous Bill Numbering (Jul 15, 2026)

### Bill Numbering Overhaul

Previous bill numbers reset their sequence counter every billing period (`YYMM` segment), producing `…-2606-001`, `…-2607-001` — a new series each month. This was incompatible with Indian GST filing requirements, which expect a single unbroken series within a financial year.

**New format:** `{Prefix}-{Type}-{FYSTR}-{NNNN}`
- `FYSTR` is the financial year string (e.g. `2627` for April 2026 – March 2027)
- `NNNN` is a 4-digit zero-padded sequence that increments continuously across months, resetting only on April 1 each year
- Three independent series per association per FY: `MANT`, `ELEC`, `OTHR`

**Examples (same association, same FY):**
- June maintenance bill: `OOR1A2B-MANT-2627-0001`
- July maintenance bill: `OOR1A2B-MANT-2627-0002`
- August electricity bill: `OOR1A2B-ELEC-2627-0001`

Old bills retain their original numbers (issued documents cannot be renumbered). The two formats are visually distinct — old numbers have a `YYMM` segment, new ones have a `FYSTR`.

**Atomicity fix:** The old sequence was computed in application code by scanning existing bills, creating a race-condition window for concurrent billing runs. The new `allocate_bill_no()` Postgres function uses `INSERT … ON CONFLICT DO UPDATE … RETURNING` to allocate the next sequence number atomically, eliminating that risk.

### PDF Cleanup — Payer/Paid By Removed

The "Payer" column (Owner / Tenant) has been removed from bill PDF line items, and the "Paid By" field has been removed from receipt PDFs. These internal routing labels are not required on externally facing documents.

---

## Release v3.7 — Billing Entity, Bill-To Override, PAN, Type-to-Confirm & Ooruda Branding (Jul 6, 2026)

### Billing Entity: Individual vs Company

Both owners and tenants can now be flagged as individuals or companies. This controls what appears on bills and receipts.

**Owner (per unit):**
- New "Owner is a company" checkbox in the Edit Unit dialog.
- When checked: company name (required), registered address (optional, falls back to unit address), and GSTIN (optional) can be set.
- Stored on the `units` table (`owner_is_company`, `owner_company_name`, `owner_company_address`, `owner_company_gstin`).

**Tenant (per tenancy):**
- New "Tenant is a company" checkbox in the Assign Tenant flow within the Edit Unit dialog.
- Same fields: company name, registered address, GSTIN.
- Stored on the `tenancies` table (`is_company`, `company_name`, `company_address`, `company_gstin`).

**On bills and receipts:**
- The "Bill To" block replaces the old "Unit" block and shows: name (person or company), address (company registered address if set, else derived unit address), and company GSTIN if applicable.
- Address derivation: `door_no` + unit number + floor + association address (no separate field needed for individuals or companies without a distinct registered address).

### Bill-To Override (per unit)

A new **Bill to** dropdown in the Edit Unit dialog controls who receives the bill for each unit:

| Setting | Behaviour |
|---|---|
| Auto (default) | Tenant if unit is occupied; owner otherwise |
| Always owner | Bills always go to the owner, even when a tenant is active |
| Always tenant | Bills always go to the tenant; falls back to owner if unoccupied |

Stored as `bill_to` on the `units` table.

### Association PAN Number

Associations can now store a **PAN number** in Settings → Association → Tax Settings (below GSTIN).

- PDF headers: GSTIN is shown if set; otherwise PAN is shown. If neither is set, neither appears.
- Stored as `pan_number` on the `associations` table.

### Type-to-Confirm Deletion

All hard-delete operations now require the user to type a confirmation string before proceeding:

- **Delete Unit** (super admin only): type the unit number (e.g. `A-101`) to confirm.
- **Delete Electricity Bill** (super admin only): type `DELETE` to confirm.
- Implemented via a reusable `TypeToConfirmDialog` component in `apps/web/app/[locale]/home/[account]/_components/`.
- Old `AlertDialog`-based confirmations replaced.

### Ooruda Footer Branding

The "Generated from Ooruda" link in all PDF footers (bills, receipts, electricity bills) is now **bold** with the brand gold colour (`#fcd469`), making the Ooruda name visually distinct on printed documents.

The electricity bill PDF footer was refactored to use the shared `DocumentFooter` component (previously duplicated inline) so both PDF types stay in sync.

### Code Quality Fixes (Jul 6 session)

- **Bill number RPC**: Removed unnecessary `as any` cast from the `allocate_bill_no` RPC call — the function is already typed in `database.types.ts`.
- **Audit logging**: Sequence-allocation failures now emit a structured `logAuditEvent` entry instead of a bare `console.error`.
- **Sub-meter CSV validation**: CommonArea rows now require `unit_no = COMMON`; using a real unit number raises a parse-time error explaining that `unit_no` is ignored for CommonArea meters.
- **Meter readings CSV**: `current_reading` validation error message corrected from "positive number" to "non-negative number" (a reading of 0 is valid for a new meter).
- **Electricity bill PDF**: Footer extracted to shared `DocumentFooter` component (no duplicate Ooruda link).

### Dependencies

- `@supabase/postgrest-js` bumped from `2.106.2` → `2.109.0` (minor patch).
- `@supabase/phoenix` bumped from `0.4.2` → `0.4.4`.

---

## Release v4.0 — Association Onboarding & XLSX Import (Jul 7, 2026)

Branch: `week-4-enhancements`

This release focuses on onboarding associations with their existing data. All import dialogs now accept Excel (XLSX) files alongside CSV, and the system understands the specific column formats used by associations in their own records.

### Shared Spreadsheet Parsing Utility

- New `apps/web/lib/parse-spreadsheet.ts` shared utility using SheetJS (`xlsx`).
- `parseSpreadsheetFile(file)` — detects `.xlsx` vs `.csv` by extension; normalises all headers to `lowercase_with_underscores`; returns `Record<string, string>[]`.
- `downloadXlsxTemplate(filename, headers, sampleRows)` — generates and downloads XLSX import templates.
- Used by all four import dialogs, replacing the previous per-dialog CSV parsing.

### XLSX Support Across All Import Dialogs

All four bulk import dialogs now accept both `.csv` and `.xlsx` files:

- **Import Units** (units page)
- **Import Sub-meters** (electricity page, super admin)
- **Import Meter Readings** (electricity page)
- **Import Other Charges** (billing page)

File upload labels and instructions updated to remove "CSV" references. Template downloads now produce `.xlsx` files.

### Units Import: Association Column Format

The units import dialog now understands the association's native column format:

| Association column | System column |
|---|---|
| `AREA` | `area_sqft` |
| `DOOR_NUMBER` | `door_no` |

Files with columns `UNIT_NO, TYPE, FLOOR, AREA, DOOR_NUMBER` are accepted without any manual column remapping.

### Admin Bulk Invite: Association User XLSX Format

The admin bulk-invite dialog now auto-detects and handles the association's user data XLSX format:

- **Detection**: presence of `OWNER_MOBILE_NO` column (after normalisation) identifies the association format.
- **Format**: `UNIT_NO, OWNER_NAME, OWNER_MOBILE_NO, OWNER_EMAIL_ADDRESS, UNIT_STATUS, TENANT_OR_ORGANIZATION_NAME, TENANT_MOBILE_NO, TENANT_EMAIL_ADDRESS`
- **Row expansion**: each association row expands to 1–2 invite rows:
  - `SELF OCCUPIED` → owner invite only
  - `RENTED` → owner invite + tenant invite (if tenant name + phone present)
  - `VACANT` → owner invite only (builder as `prop_owner`)
- **Unit status**: `SELF OCCUPIED` / `RENTED` → `Occupied`; `VACANT` → `Vacant`. Status is written to `units.status` after memberships are created.
- **Validation**: `UNIT_STATUS` is mandatory; unrecognised values produce a clear parse-time error.
- Preview table shows: phone, name, role, unit number, and status per expanded row.

### Electricity: Sub-meter Onboarding Columns

Two new columns added to `sub_meters`:

| Column | Type | Purpose |
|---|---|---|
| `initial_reading` | `numeric(12,2)` | Last recorded reading before onboarding — used as the `previous_reading` fallback when calculating the first electricity bill |
| `minimum_charge` | `numeric(10,2)` | Default monthly minimum charge for this meter — auto-filled on every meter reading without a per-reading override |

**Sub-meter import** (CSV/XLSX) accepts association column aliases:

| Association column | System column |
|---|---|
| `INITIAL_METER_READING` | `initial_reading` |
| `MIN_CHARGES` | `minimum_charge` |

Both fields are optional (default 0). Preview table shows Init. Reading and Min. Charge columns.

### Electricity: Simplified Meter Readings Import

The meter readings import was completely rewritten to match the format associations will supply:

- **New format**: `SUB_METER_NO, CURRENT_METER_READING` only (2 columns).
- Sub-meters are looked up by their label (`meter_label`) within the association — no unit number needed.
- **Previous reading** auto-filled: last recorded reading before the selected period, falling back to `sub_meter.initial_reading` for newly onboarded meters.
- **Minimum charge** auto-filled from `sub_meter.minimum_charge` — no per-row override needed.
- **Duplicate detection**: duplicate sub-meter labels within the file are rejected at parse time with a clear error.
- CommonArea meters are included naturally — their `meter_label` (e.g. `Common-Lift`) identifies them directly.
- Template updated to 2-column format; instructions updated to explain auto-fill behaviour.

### Code Quality & Security Improvements

- **`server-only` guard**: `electricity-actions.ts` now imports `server-only` to prevent accidental client-side bundling.
- **Server-side input validation**: `bulkImportMeterReadingsAction` validates period format (`YYYY-MM` regex) and enforces a 500-row cap on both bulk import actions.
- **Unit status error logging**: unit status update failures in `bulkInviteMembersAction` are now logged via the structured logger (previously silently swallowed).
- **Unit number case consistency**: deduplication key and DB query in the unit status update loop both normalise to uppercase, eliminating silent no-op updates.
- **File parse errors surfaced**: both electricity import dialogs show a toast if the XLSX/CSV parse throws (previously: silent unhandled rejection).
- **`useTransition` in admin bulk invite**: replaced manual `useState`/`setPending` with `useTransition` and added an error toast on action failure.
- **Dead code removed**: redundant `seen` Map loop in meter readings dialog removed.

### Migration

| Migration | Description |
|---|---|
| `20260716000000_sub_meters_initial_reading_min_charge.sql` | Add `initial_reading` and `minimum_charge` columns to `sub_meters` |

### Electricity: Transmission-Loss Recovery in Billing Rate

The electricity per-unit charge formula has been updated:

| | Formula |
|---|---|
| **Old** | `rate = invoice_amount ÷ block_consumption_units` (MESCOM main meter) |
| **New** | `rate = invoice_amount ÷ sum of all sub-meter consumed units` (including CommonArea) |

Since the sum of individual sub-meter readings is always less than the MESCOM main meter reading (due to building transmission losses), the new rate is proportionally higher — ensuring the full MESCOM invoice is always recovered from occupants. Losses are distributed proportionally based on each unit's consumption. CommonArea sub-meters are included in the denominator.

This change affects both bill generation and electricity bill PDFs (which show the per-unit rate in the meter breakdown table). The PDF generation was also optimised to fetch all meter readings in a single query (instead of two), using the database-generated `consumed_units` value directly.

### Dependencies

- `xlsx` (SheetJS) added to `apps/web` and `packages/features/admin` for XLSX parsing and template generation.

### Admin Panel: Test vs Real Tagging

- `is_test` boolean column added to both `associations` and `profiles`.
- Two test associations renamed: Abish Association → **Sandbox Residency**, Prestige Meadows → **Demo Towers**. Both marked `is_test = true`.
- Eleven test users (phone numbers `+919911000001–020`) renamed to a `[Role] T. [Descriptor]` pattern (e.g. Arjun T. Admin) and marked `is_test = true`.
- **Test badge**: amber "Test" tag shown next to the account name in the admin accounts list and on the team account detail page for test associations/users.
- **Kind filter**: new "Kind" dropdown in the admin accounts table — filter to "All", "Real", or "Test". Filtering is server-side (accounts table queried with `.in()` / `.not().in()` against the precomputed test account ID set).

### Admin Bulk Invite: XLSX Data Cleaning & Owner Enrichment

Improvements to handle real-world data quality issues found in association-supplied XLSX files:

- **Phone normalisation**: `cleanPhoneCell()` strips Excel float suffixes (`9876543210.0` → `9876543210`), collapses internal spaces (`94482 53545` → `9448253545`), and trims trailing whitespace before the `+91` prefix is added.
- **Unit number float cleanup**: `cleanUnitNo()` converts Excel-numeric cells that arrive as `"101.0"` → `"101"`. Alphanumeric unit numbers (e.g. `G1A`) are passed through unchanged.
- **Company owner detection**: `isCompanyName()` matches common Indian business entity suffixes (LLP, Pvt Ltd, Limited, Buildcon, Infotech, Management, Realty, etc.). When the owner name matches, `owner_is_company = true` and `owner_company_name` are written to the unit — no invite is suppressed, a contact is still created under that phone.
- **SELF OCCUPIED firm name capture**: when a SELF OCCUPIED row has a grey-cell tenant/organisation name (the occupying firm), it is stored as `owner_company_name` on the unit for billing purposes. No tenancy row is created. If both the owner and tenant organisation are companies, the tenant company name takes priority as the billing entity.
- **Joint ownership name handling**: when `OWNER_NAME` contains ` & ` (e.g. `UJWAL N SALIAN & HARSHALATHA U SALIAN`), only the first name is used for the account — one account per phone number.
- **Server-side owner enrichment**: after all invites are processed, `bulkInviteMembersAction` fetches the resolved user IDs by phone and writes `owner_id`, `owner_is_company`, and `owner_company_name` to the relevant unit rows in a single pass.

### Admin Panel: Delete User Cache Bust

- `deleteUserAction` now calls `revalidateAdmin()` before `redirect()`, so the accounts list refreshes immediately after a user is deleted.

### Admin Panel: Tabs & Label Renames

- Account type filter replaced with **tabs**: All | Associations | Users (was a dropdown with All / Team / Personal).
- "Type" column values renamed: "Team" → "Association", "Personal" → "User".
- Account detail page badges renamed: "Personal Account" → "User Account", "Team Account" → "Association".
- Units page button renames: "Bulk Invite Users" → **"Invite Members"**, "Import CSV" → **"Import Units"**.

### Migration

| Migration | Description |
|---|---|
| `20260707122210_test_flags_and_rename_test_data.sql` | Add `is_test` to `associations` and `profiles`; rename and mark test associations and users |
| `20260707132123_sync_test_user_account_names.sql` | Sync `accounts.name` from `profiles.full_name` for all test users |

---

## Release v4.1 — Unit Status Overhaul & CSV Column Restructure (Jul 8–9, 2026)

### Unit Status: Self Occupied / Rented

- Replaced the single `Occupied` status with two distinct values: **Self Occupied** (owner, no active tenant) and **Rented** (active tenant)
- **Vacant** now means the unit has no owner (not yet sold / still with builder)
- Status transitions: adding an owner → Self Occupied; adding a tenant → Rented; ending tenancy → reverts to Self Occupied
- Units table filter updated: "Occupied" filter now matches both Self Occupied and Rented; new sub-filters for each
- Association dashboard occupancy count updated to include both new statuses
- Bulk XLSX import: `unit_status` column now accepts `Self Occupied`, `Rented`, `Vacant`

### Electricity: CSV Column Restructure

- **Sub Meter CSV** now only has: `UNIT_NO, SUB_METER_NO, METER_TYPE, INITIAL_METER_READING`; `LOAD_KVA` and `MIN_CHARGES` removed
- **Current Readings CSV** now includes optional columns: `LOAD_KVA, MIN_CHARGES` — allow per-period overrides without touching the sub-meter record
- Blank CSV value for `LOAD_KVA` / `MIN_CHARGES` → carry forward last month's recorded value automatically (no overwrite)
- Full fallback chain: (1) CSV value → (2) existing reading for this bill → (3) most recent prior-period reading → (4) sub-meter default → (5) 0/null
- New `load_kva` column added to `meter_readings` table for per-reading tracking
- Dialog instructions updated to reflect the new column structure and fallback behaviour

### Multi-Role Members: assoc_admin as Owner/Tenant

- An `assoc_admin` can now be assigned as unit owner or tenant — the eligibility check now accepts `assoc_admin` in addition to the specific `prop_owner`/`tenant` role
- A member who owns one unit and rents another in the same association now sees bills for both on the payments page — unit IDs are unioned from ownership and active tenancies instead of branching on a single role
- Bulk XLSX invite: `assoc_admin` rows that carry a `unit_no` now write `owner_id` on the unit (admins are assumed to be unit owners; if an admin is a tenant, include a separate `tenant`-role row)

### Bug Fix: Bulk Invite Unit Linking

- Fixed: unit association FK was resolved to `accounts.id` instead of `associations.id` (different UUIDs), causing all unit updates to silently fail
- Added a second lookup map `assocRowIdByAccountId` to correctly resolve `associations.id`

### Migrations

| Migration | Description |
|---|---|
| `20260708000001_unit_status_self_occupied_rented.sql` | Drop old `Occupied` CHECK; migrate data; add new CHECK for `Self Occupied`, `Rented`, `Vacant` |
| `20260709000001_meter_readings_load_kva.sql` | Add nullable `load_kva` column to `meter_readings` |

## Release v4.2 — Electricity Unit Rate & Audit Log Improvements (Jul 9, 2026)

### Electricity Bills: Unit Rate Column

- Added **Unit Rate** column to the electricity bills table — shows the effective rate charged to residents (`MESCOM invoice ÷ total sub-metered consumption`), distinct from the Block Rate (`invoice ÷ MESCOM block units`)
- Both rates are now visible side by side, making it clear when MESCOM block units differ from actual sub-meter consumption
- Footer text updated to accurately describe both rates
- Defensive guard added: Block Rate and Unit Rate both display `—` when the denominator is zero (previously could render `Infinity/unit`)

### Bulk Invite: Audit Logging

- `bulkInviteMembersAction` now writes one `audit_logs` entry per association after a successful bulk import
- Uses `adminClient` directly (super admin is not an association member, so standard RLS policy would reject the insert)
- Audit inserts run in parallel (`Promise.all`) and errors are logged without failing the import

---

| Module | Status | Key Capabilities |
|---|---|---|
| **Authentication** | Complete | Phone OTP sign-in, email OTP fallback, invite-only model, complete profile flow |
| **RBAC** | Complete | 4 roles (assoc_admin, billing_operator, prop_owner, tenant), JWT hook, `requireRole()` guard, super admin |
| **Associations** | Complete | Settings (general, electricity, tax, billing), logo upload, charge type configuration |
| **Units** | Complete | CRUD, CSV import, common area type, owner/tenant assignment, unit detail + tenancy timeline, bill-to override, owner company billing entity, type-to-confirm deletion |
| **Members** | Complete | Phone invitations, email invitations, role-restricted invitations, phone number normalization |
| **Electricity** | Complete | Sub-meter management, bill upload (with period date range), meter readings (manual + CSV import), block rate calculation, redesigned PDF with per-meter breakdown and authorised signatory |
| **Billing** | Complete | Bill generation (maintenance, electricity, other charges), line items, PDF, filters, common area |
| **Other Charges** | Complete | Ad-hoc charges staging, flat/per-sqft split, CSV import |
| **Payments** | Complete | Record payments (cash/UPI/bank/cheque), payment history, PDF receipts, bill status auto-sync |
| **Reports** | Partial | Arrears summary, payment summary, billing overview (more report types deferred) |
| **Audit Logs** | Complete | Structured event log, all actions instrumented |
| **Notifications** | Partial | Log view with read/unread state (push delivery not yet wired) |
| **Admin Panel** | Complete | Create association, create/edit/remove users, manage roles, association permissions, bulk CSV member invite, payment gateway config per association |
| **Self-Service Payments** | Complete | Owner/tenant Razorpay checkout (Pay individual bill, Pay All Pending), per-association gateway credentials, batch grouping |
| **Dashboard** | Complete | Real-data metric cards with duration filter, clickable navigation to billing/payments, multi-unit billing summary with all-period outstanding aggregation, recent activity feed |

---

---

## Release v4.7 — Razorpay Async Webhook (Jul 9, 2026)

Branch: `week-4`

### Razorpay Async Webhook Safety Net

Handles the edge case where a user pays on Razorpay but the synchronous `/verify` call never reaches the server (browser closed, network drop, etc.). Razorpay retries the webhook until it gets a 200, so no payment is ever silently lost.

**New route `app/api/billing/razorpay/webhook/route.ts`:**
- Receives `payment.captured` events from Razorpay (all other events acknowledged and ignored)
- Reads raw body before parsing for correct HMAC-SHA256 signature verification (`X-Razorpay-Signature` header vs `webhook_secret`)
- Rejects requests if `webhook_secret` is not configured in gateway settings (prevents spoofing)
- Reads `bill_ids`, `association_id`, `paid_by_role` from Razorpay order `notes` — no separate lookup table needed
- Calls `record_payment` RPC via admin client (service_role) for each bill
- Fully idempotent: if `/verify` already recorded the payment, the `payments_razorpay_bill_uniq` DB index rejects the duplicate and the webhook skips silently
- Returns 500 on unexpected DB errors so Razorpay retries; returns 200 on success or duplicate

**Fixed `app/api/billing/razorpay/create-order/route.ts`:**
- Now embeds `notes: { bill_ids, association_id, paid_by_role }` in every Razorpay order so the webhook handler can identify the bills without a separate DB lookup

**Migration `20260709200000_record_payment_webhook_bypass.sql`:**
- Updates `record_payment()` to allow `service_role` callers to skip the user-session auth check (webhook has no user JWT). All existing user-facing auth paths are unchanged.
- Grants `execute` to both `authenticated` and `service_role`

**Prerequisite to activate:** Register the webhook URL in Razorpay Dashboard → Settings → Webhooks, select `payment.captured`, copy the generated webhook secret, and paste it into the association's Gateway Settings page. See TODO.md.

---

## Release v4.6 — Overdue Status Code Compatibility (Jul 9, 2026)

Branch: `week-4`

### Status Filter & Dashboard Fixes

Companion fix for the `recompute_overdue_bills()` cron introduced in v4.5. The cron stores `'Overdue'` directly in `bills.status`, but all existing filter/display code assumed that status was always computed client-side and never stored. Updated four locations to handle `status='Overdue'` from the DB:

- **`billing/_components/bills-section.tsx`** — overdue filter tab now also matches `b.status === 'Overdue'`
- **`payments/_components/payments-section.tsx`** — overdue filter tab + Pay All Pending button include `'Overdue'` bills
- **`units/page.tsx`** — DB query changed from `.eq('status', 'Unpaid')` to `.in('status', ['Unpaid', 'Partial', 'Overdue'])` so overdue units still show their badge count
- **`_components/association-dashboard.tsx`** — outstanding balance calculation includes `'Overdue'` bills

Both migrations (`20260702000004_razorpay_gateway`, `20260709112744_overdue_and_reminder_cron`) pushed to remote.

---

## Release v4.5 — Overdue Recompute & Reminder Cron (Jul 9, 2026)

Branch: `week-4`

### Automated Bill Status & Reminders

**Migration `20260709112744_overdue_and_reminder_cron.sql`:**
- Enables `pg_net` extension for outbound HTTP from the database
- `public.recompute_overdue_bills()` — SQL function that transitions `Unpaid`/`Partial` bills to `Overdue` where `due_date < current_date`
- `cron.schedule('overdue-recompute', '30 19 * * *', ...)` — fires daily at 1 AM IST; runs the overdue recompute function
- `cron.schedule('send-reminders', '30 3 * * *', ...)` — fires daily at 9 AM IST; calls the `send-reminders` Edge Function via `pg_net`

**New Edge Function `supabase/functions/send-reminders/index.ts`:**
- Reads each association's `billing_settings.reminder_schedule_json` (`days_before` + `days_after` arrays)
- Finds bills due on matching dates (e.g. 3 days before due, 1 day after due)
- Batch-fetches unit owners and active tenants; batch-fetches phone numbers
- Sends SMS via the same provider logic as `custom-sms-hook` (mock/MSG91/2Factor)
- Logs every attempt to `notifications_log` with type `due_date_reminder` or `overdue_reminder`

**Prerequisite:** One-time DB GUC configuration needed before reminder cron fires — see TODO.md → "Pre-launch: Cron Job Configuration".

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260709112744` | pg_net extension, `recompute_overdue_bills()` function, overdue + reminder cron schedules |

---

## Release v4.4 — Notification Event Wiring (Jul 9, 2026)

Branch: `week-4`

### SMS Notifications — Billing Events

Wired billing events to send SMS notifications to owners and tenants via the existing `packages/sms` infrastructure.

**SMS package extended (`packages/sms`):**
- Added `sendSms(phone, message)` to `ISmsProvider` interface and all three providers (Mock, MSG91, 2Factor)
- MSG91: uses Flow API with `MSG91_SMS_FLOW_ID` + `MSG91_SMS_SENDER_ID` env vars for DLT-compliant transactional SMS
- 2Factor: uses TRANS_SMS endpoint

**New notification service (`apps/web/lib/notify.ts`):**
- `sendBillGeneratedNotifications(associationId, unitIds, monthLabel)` — batch fetches owners + active tenants for all billed units in two queries, then sends in parallel; fire-and-forget (never blocks billing)
- `sendPaymentConfirmedNotification(params)` — single-user payment receipt SMS

**Trigger points wired:**
- `billing-actions.ts` → after successful bill generation batch, notifies each unit's owner and active tenant
- `payments-actions.ts` → `recordPaymentAction` notifies the unit owner after manual payment recording
- `verify/route.ts` → Razorpay self-service payment notifies the payer (owner/tenant) after successful checkout

**All events logged to `notifications_log`** with `type`, `status` (Sent/Failed), `provider_key`, and `provider_ref` (provider message ID).

| Feature | Status |
|---|---|
| Notifications | Partial → **SMS delivery wired for bill_generated and payment_confirmed** |

### Migrations Changelog

No new migrations (uses existing `notifications_log` table).

---

## Release v4.3 — Razorpay Gateway Config UI (Jul 9, 2026)

Branch: `week-4`

### Payment Gateway Settings

Added an admin-only **Payment Gateway** settings card to the Association Settings page (`/settings/association`), completing the Razorpay self-service payment setup flow:

- **Key ID / Key Secret / Webhook Secret** fields — credentials stored server-side via admin client; secrets never serialised into the React tree
- **Enable online payments** toggle — controls `is_active` on `association_payment_gateways` per association
- Insert vs update logic — first save creates the row (key secret required); subsequent saves allow partial updates (blank secret = keep existing)
- Secret presence shown as `has_secret: boolean` indicator only — actual values never reach the client
- Success/error toast feedback; `data-test` attributes on all interactive elements

---

## Bug Fix — Super Admin Association Name / Logo Save

Branch: `week-4`

### Super Admin Write Access for Account Name and Logo

Fixed "Couldn't save your changes" error when a super admin tried to update an association's name or logo from the Association Settings page.

**Root cause:** The `accounts_settings_manage_update` RLS policy and the `account_image` storage policy both gate on `has_permission(auth.uid(), account_id, 'settings.manage')`, which checks `accounts_memberships`. Super admins are not actual members of associations they're inspecting, so `has_permission` returned false — blocking the `accounts` UPDATE and the storage upload even though `association_role()` correctly returns `'assoc_admin'` for super admins.

**Fix (`20260716000001_super_admin_account_write_access.sql`):**
- `accounts_settings_manage_update` policy: added `public.is_super_admin()` OR-branch to both USING and WITH CHECK clauses
- `account_image` storage policy: added `public.is_super_admin()` OR-branch to the WITH CHECK clause (read access was already gated on `has_role_on_account` which super admins pass via existing bypass)

---

## Bug Fix — Bulk Invite: existing users skipped on phone/email conflict (v4.9)

Branch: `week-4`

Users who already existed in `auth.users` but were absent from (or had a mismatched format in) `profiles.mobile_number` were not found by the upfront profile lookup. `createUser` then failed with "Phone number already registered by another user" or "This email address is already registered", and the row was skipped entirely — leaving them without association membership.

**Initial fix (v4.9):**
- When `createUser` fails with a phone or email conflict, recover by looking up the existing `auth.users` row via new service-role-only DB functions (`get_user_id_by_phone`, `get_user_id_by_email`) and fall through to the membership insert instead of skipping.
- Migration `20260716000002_get_user_id_by_phone.sql`: adds both lookup functions, restricted to `service_role`.

---

## Bug Fix — Bulk Invite: comprehensive upfront auth.users lookup (v4.10)

Branch: `week-4`

The v4.9 reactive fix was incomplete: users whose phone/email was later removed from `auth.users` (or whose auth credentials differed from the CSV) were still skipped because the initial lookup only queried `profiles.mobile_number`, which can be stale or missing.

**Root cause:** the upfront resolution used `profiles.mobile_number` — a denormalized field that may be null, cleared, or in a different format after a previous import to another association. Users existed in `auth.users` under their original credentials but didn't appear in the profiles query.

**Fix:**
- New `find_users_by_phones_or_emails(p_phones, p_emails)` Postgres function (migration `20260716000003`) queries `auth.users` directly by all batch phones AND all batch emails in a single round-trip. Restricted to `service_role`.
- Upfront lookup in `bulkInviteMembersAction` replaced: now calls `find_users_by_phones_or_emails` instead of querying `profiles`. Builds both `existingUserByPhone` and `existingUserByEmail` maps from the result.
- Per-row user resolution checks the phone map first, then the email map, before attempting `createUser`. If either matches, the existing user is used and `createUser` is never called for that row.
- The reactive conflict-recovery path (v4.9) is retained as a last-resort fallback.

### Migrations Changelog

| Migration | Date | Description |
|-----------|------|-------------|
| `20260716000002_get_user_id_by_phone.sql` | Jul 16 | Add `get_user_id_by_phone` and `get_user_id_by_email` service-role functions for bulk-invite conflict recovery |
| `20260716000003_find_users_by_phones_or_emails.sql` | Jul 16 | Add `find_users_by_phones_or_emails` batch function for comprehensive upfront auth.users lookup by phone AND email |

---

---

## Release v5.0 — Billing UX overhaul, bill number format v2, font & PDF fixes (Jul 17, 2026)

### Billing: Draft Bills tab

A new **Draft Bills** tab sits alongside **Generated Bills** on the Billing page, giving admins visibility into staged-but-not-yet-published charges before clicking Generate Bills.

- **Maintenance** — always shown for the current month if no maintenance bills have been generated yet
- **Electricity** — shows each `mescom_bills` entry whose period has no generated unit bills yet
- **Other Charges** — lists all rows in `pending_other_charges`
- Summary bar mirrors the Generated Bills metrics strip (section counts, totals)
- Type and period filters; Other Charges paginate at 20 rows per page
- Tab badge counts section groups (max 3), not individual items, matching the in-tab summary
- Hint text ("These bills are staged…") positioned below filters; neutral section styling matching Generated Bills

### Billing: Bill number format v2

New format: `{INITIALS}/{FY}/{TYPE}/{NNNNNN}`  
Example: `PRM/26-27/MNT/000001`

- **INITIALS** — first letter of each word in the association account name, up to 3 words (e.g. "Prashanth Residency Manor" → `PRM`)
- **FY** — Indian financial year formatted as `YY-YY` (e.g. `26-27`)
- **TYPE** — `MNT` (maintenance), `ELT` (electricity), `OTH` (other charges); future: `SNK`, `DGU`
- **NNNNNN** — 6-digit zero-padded counter, independent per (association, type, financial year)
- Existing bills keep their old format; duplicate-detection guards handle both old and new formats
- `bill_sequences` check constraint expanded to allow both legacy codes and new codes

### Electricity & Billing: period selector fixes

- Electricity period selectors (Add Bill, Import Meter Readings) now exclude the current month — electricity billed this month is for last month's consumption
- Default period pre-selects the previous month

### Font & styling fixes

- `body` now explicitly sets `font-family: var(--font-sans)` so dialog portals (rendered outside the root layout) inherit Inter correctly
- `--font-mono` replaced with a system monospace stack (Geist Mono was never loaded)
- Dashboard duration select uses `router.replace` instead of `router.push` to avoid polluting browser history

### PDF fixes

- Electricity bill PDF: header no longer overflows for long association names (`flex: 1` + `paddingRight` on the brand block); `associationName` font size reduced to 12
- Electricity bill PDF: sub-meter labels strip the `SM ` prefix (e.g. "SM G2" → "G2")
- Bill and receipt PDFs: association contact details (email, phone, bank details) now passed through correctly; `referenceNo` included on receipts

### Bug fixes

- `billing_settings` upsert: `.update()` silently matched 0 rows when no row existed for a new association; replaced with `.upsert(..., { onConflict: 'association_id' })`
- Draft Bills tab badge was counting raw item counts instead of section groups, causing mismatch with the "N drafts pending" summary text
- PDF generation: duplicate `ExtendedAssocElec` type cast removed; electricity path now reuses `assocData`
- Filter dropdowns in Draft Bills now display human-readable labels ("All Types", "Other Charges") instead of raw keys
- Generated Bills Overdue filter now correctly matches bills where the cron has already set `status = 'Overdue'` in the DB (previously only matched bills still in `Unpaid`/`Partial` state)
- `recompute_overdue_bills()` cron function now skips bills with `total_amount = 0`; 24 existing zero-amount bills corrected from `Overdue` → `Unpaid` on remote

### Migrations Changelog

| Migration | Date | Description |
|-----------|------|-------------|
| `20260717000000_associations_contact_bank.sql` | Jul 17 | Add contact and bank fields to `associations` table |
| `20260717000001_bill_no_format_v2.sql` | Jul 17 | Expand `bill_sequences` check constraint; replace `allocate_bill_no` with new `PREFIX/FY/TYPE/NNNNNN` format |
| `20260713000002_fix_recompute_overdue_zero_amount.sql` | Jul 13 | Fix `recompute_overdue_bills()` to skip zero-amount bills |

---

## Bug Fix — Exclude Common Area from Units List and Dashboard Counts (Jul 10, 2026)

### Units & Dashboard: Common Area Filtering

- **Units Page** — `Common Area` type units are now filtered out from the main Units & Owners page table and metric cards (Total, Occupied, Vacant). This prevents them from incorrectly counting towards vacant commercial/residential spaces.
- **Dashboard** — `Common Area` type units are also excluded from the total units and occupied units counts on the association overview dashboard.
- **Database** — Common Area units remain in the database to support electricity sub-meters and utility billing mapping.

---

## Billing PDF Redesign, Tenancy Data Isolation, Super-Admin Bulk Delete (Jul 18–21, 2026)

### PDF Redesign — Bill, Receipt, Electricity Bill

- Header: association logo enlarged (~2x), name font reduced for balance, single continuous separator rule (was two segments with a decorative gap that read as "broken")
- Contact strip now shows `Email:` / `Phone No:` labels instead of bare values
- Unit floor formatted as ordinal ("2nd Floor", "3rd Floor", "11th Floor", "Ground Floor", "Basement N") in Bill To / Received From addresses
- Line item descriptions now read "{Charge Name} for {Month Year}" (e.g. "Maintenance for July 2026")
- Electricity bill: added "Electricity Bill for {Month Year}" caption above the meter table; renamed Previous/Current columns to "Previous Reading"/"Current Reading"; removed the Paid/Outstanding panel and both signature blocks; colors aligned to the shared navy/cream palette
- Bank details, brand colors, header/footer layout matched to the association's reference invoice template

### Per-sqft Maintenance: Area & Rate columns

- `bill_line_items` gained nullable `area_sqft` / `rate_per_sqft`, populated only when the charge type is `calc_method = 'per_sqft'` at generation time
- Bill PDF and the in-app "View breakdown" dialog show Area (sq.ft) / Rate/sq.ft columns after Description, but only when at least one line item on that bill actually has them — an association fully on a per-unit/flat maintenance model renders the plain table, and historical per-sqft bills keep their original values even after a later switch to per-unit billing

### Tenancy Data Isolation (privacy fix)

- Bills/payments previously had no link to the tenancy that was active when they were generated, so a **new tenant on a unit could see every past tenant's bill/payment history** (amounts, payment mode, receipt numbers) once assigned to that unit
- Added `bills.tenancy_id`, stamped at generation time from the unit's currently active tenancy; backfilled for existing bills by matching period against tenancy date ranges
- PDF download authorization now checks that a tenant's own tenancy matches the bill's `tenancy_id` (owners are unaffected — they still see every bill for units they own)
- "Bill To" on a bill/receipt now resolves from the bill's own recorded tenancy, not whichever tenancy happens to be active *now* — prevents an old bill's payer name from silently changing after a tenant turnover and PDF cache regeneration
- Owner dashboard and Payments page bill/payment lists scoped the same way for rented units

### Super-Admin Bulk Delete

- "Delete all bills" (billing page) and "Delete all payments" (payments page) buttons, visible only to super admins (checked independently of the `assoc_admin`-equivalent role granted when viewing an opened workspace)
- Type-to-confirm (association slug) dialog showing live bill/payment/receipt counts before deletion
- Backed by `security definer` RPCs (`super_admin_delete_all_bills`, `super_admin_delete_all_payments`) with an explicit `is_super_admin()` check inside — not reliant on RLS, since RLS can't distinguish a real assoc_admin from an impersonating super admin
- Deleting bills cascades to line items/payments/receipts, resets bill numbering, and cleans up orphaned cached PDFs from storage; deleting payments leaves bills intact (they revert to their unpaid state)

### Bug fixes

- Owner dashboard "Total Amount Due" only checked for `status IN ('Unpaid','Partial')`, missing bills already persisted as `'Overdue'` — such bills silently dropped out of the outstanding total, showing "All paid" when money was actually owed
- Owner dashboard "Bill history" / "My payments" cards hard-capped at 3 items with no way to see the rest — a unit with 5 bills only showed 3
- `admin-account-page.tsx`: the newly-added `profiles.mobile_number` phone fallback was unreachable because `??` doesn't treat `''` (the typical value of `auth.users.phone` for phone-OTP-only accounts) as absent — switched to `||`
- `GenerateBillsSchema`: a `.refine()` meant to give a friendly "Please select a bill type" message could never fire (the underlying `z.enum()` already rejects `undefined` before refine runs) — moved the message onto the enum itself
- Parallelized bill generation (electricity/maintenance/other charges) had regressed to a generic "Failed to generate one or more bills" error; restored per-type error messages

### Migrations Changelog

| Migration | Date | Description |
|-----------|------|-------------|
| `20260718000000_bills_tenancy_id.sql` | Jul 18 | Add `bills.tenancy_id`, backfill from tenancy date-range overlap |
| `20260719000000_super_admin_delete_all_billing.sql` | Jul 19 | Add `super_admin_delete_all_bills` / `super_admin_delete_all_payments` RPCs |
| `20260720000000_invalidate_bill_pdf_cache_again.sql` | Jul 20 | Re-invalidate cached bill/receipt PDFs after template changes |
| `20260721000000_bill_line_items_area_rate.sql` | Jul 21 | Add `bill_line_items.area_sqft` / `rate_per_sqft` |
| `20260710000001_payments_reference_no.sql` | Jul 13 | Add `payments.reference_no` for bookkeeping reference numbers |
| `20260722000000_invalidate_receipt_pdf_cache.sql` | Jul 22 | Clear cached receipt PDF URLs so they regenerate with the reference column |
| `20260722000001_invalidate_electricity_bill_pdf_cache.sql` | Jul 22 | Clear cached electricity bill PDF URLs so they regenerate with renamed line descriptions |
| `20260715000003_pending_other_charges_due_date_billed.sql` | Jul 15 | Adds `due_date` (optional per-charge due date override) and `billed` (tracks whether a pending charge has been included in a generated bill) to `pending_other_charges` |
| `20260723000000_cash_ledger.sql` | Jul 23 | New `cash_ledger` and `cash_ledger_payments` tables, `bills.advance_applied` column, balance RPCs |
| `20260723000001_billing_advance_applied.sql` | Jul 23 | Updated `create_bill_with_items`, `sync_bill_payment_status`, `record_payment`, `recompute_overdue_bills` for advance_applied |

---

## Release v4.12 — PDF & Receipt Fixes (Jul 22, 2026)

### Electricity Bill PDF
- **Sub-meter and total rows** now render with a white background (previously inherited an unintended cream background)
- **Line descriptions renamed**: the meter reading row now reads "Electricity Charges for &lt;Month Year&gt;" (instead of "Sub-meter X"), and the total row reads "Total Electricity Charges" (instead of "Electricity Charges for &lt;Month Year&gt;")
- Invalidated all cached electricity bill PDFs so they regenerate with the new labels on next download

### Receipt PDF — Reference Number
- **Reference number now appears on receipts**: fixed a silent save failure where `reference_no` was blocked by RLS on the regular server client; the follow-up UPDATE now uses the admin client (access already validated by `requireBillingAccess`)
- Invalidated all cached receipt PDFs so they regenerate with the reference column on next download

---

## Release v4.11 — Reference Numbers, Dashboard Defaults & UX Fixes (Jul 13, 2026)

### Payment Reference Numbers
- Added a free-text **Reference No** field to the Record Payment dialog (mode-specific placeholder: "UPI transaction ID", "UTR number", etc.; hidden for Razorpay)
- Reference is stored in a new `payments.reference_no` column and displayed below the payment mode in the payments list
- Reference appears on the receipt PDF in the Payment Details table

### Dashboard Improvements
- **Default filter changed to "All Time"** — the dashboard duration filter now defaults to All Time instead of Current Month
- **Performance**: association lookup moved to the page level and passed as props, eliminating a sequential DB round-trip; all dashboard queries now run in a single `Promise.all` inside a Suspense boundary

### Billing UI
- **Unit filter dropdown** now correctly displays "All Units" instead of the raw value `all`
- **Breakdown tooltip**: hovering over a truncated line-item description in the billing table shows the full text in a tooltip

### Admin Panel
- **Edit User dialog**: phone number now falls back to `profiles.mobile_number` for users who registered via email/Google (previously showed blank)
- **Super admin accounts view**: removed the All/Real/Test kind filter dropdown

### PDF & Dialog Fixes
- Electricity bill PDF: abbreviated column headers (Prev./Curr. Reading), wider reading columns, normalised meter labels to "Sub-meter X" prefix, period shown in total row
- TypeToConfirmDialog: explicit red styling for the destructive action button

---

## Cash Ledger (2026-07-14)

Per-unit credit/debit ledger for advance payments and standalone dues.

### New Features

- **Cash Ledger page** (`/cash-ledger`): per-unit running balance table with debit/credit columns and a live net balance chip. Visible to all roles (admin sees all units; owners/tenants see their own unit).
- **Add Entry dialog**: admins and billing operators can add standalone dues (debit) or advance payments (credit) against any bill type.
- **CSV Import** (3-step: upload → preview → submit): bulk import dues and advance payments from a spreadsheet. Download a pre-filled template from the dialog. Blank `paid_on` defaults to 2026-06-30.
- **Advance auto-apply**: when a bill is generated, any positive cash-ledger balance for the matching unit + bill type is automatically applied. The bill's `advance_applied` column tracks this amount. Bill status is set to `Paid` (if advance ≥ total) or `Partial` (if partial) at generation time. A corresponding `advance_applied` debit entry is created in the ledger.
- **Surplus carry-forward**: unused advance balance remains in the ledger and is automatically applied to the next bill of the same type.
- **Cash Ledger Dues section** on the Payments page: shows all units with a negative ledger balance (outstanding dues). Admin/billing operators can record a payment (Cash/Bank Transfer/UPI/Cheque) which creates a `due_payment` credit entry and a receipt record.
- **Bill PDF**: an "Advance Applied" row now appears between GST totals and the Paid row when `advance_applied > 0`. Outstanding is computed as `total − paid − advance_applied`.
- **Navigation**: "Cash Ledger" added under the Operations group, visible to all roles.

### Migrations

| File | Description |
|---|---|
| `20260723000000_cash_ledger.sql` | New `cash_ledger` and `cash_ledger_payments` tables, `bills.advance_applied` column, `get_cash_ledger_balance` and `get_association_cash_ledger_balances` RPCs |
| `20260723000001_billing_advance_applied.sql` | Updated `create_bill_with_items` (11-arg), `sync_bill_payment_status` trigger, `record_payment` RPC, `recompute_overdue_bills` to account for `advance_applied` |
| `20260724000001_cash_ledger_atomicity.sql` | Moved `advance_applied` ledger debit inside `create_bill_with_items` for atomicity; new `record_due_payment` RPC for atomic due-payment recording; revoked immutable `UPDATE` grant on `cash_ledger` |
| `20260724000002_cash_ledger_security_fixes.sql` | Added association-membership guards to `get_cash_ledger_balance` and `get_association_cash_ledger_balances` (SECURITY DEFINER cross-tenant leak); fixed `create_bill_with_items` to store the capped `advance_applied` value; moved receipt-number generation inside `record_due_payment` RPC |

*Last updated: 2026-07-15*

---

## Billing & Payments UX — Unit Filter + Breakdown Column (2026-07-15)

### Enhancements

- **Unit filter** added to both the Billing page and Payments page. Appears as a dropdown after the Duration filter when the association has more than one unit. Filters bills and payment rows instantly (client-side, no network call).
- **Stacked breakdown column** replaces the separate Maintenance and Electricity columns in the Billing page. Each bill row now shows non-zero line items stacked vertically with icons (⚡ electricity, 🔧 maintenance, 📄 other charges), making it easier to read at a glance without widening the table.

### Migrations

| File | Description |
|---|---|
| `20260724000000_drop_electricity_reconciliation.sql` | Drops the `electricity_reconciliation` table, which was scaffolded but never implemented or used in the application |

---

## Release v4.12 — Other Charges Multi-Bill, Common Area Electricity Fix & Mobile Responsive (Jul 15, 2026)

### Billing — Other Charges

- **Multiple Other Charges bills per period**: Removed the blanket "already billed" guard for Other Charges. The system now allows generating multiple OTH bills in the same month — each additional run picks up newly added (unbilled) pending charges.
- **Per-charge Due Date**: Added an optional "Due Date" field to the Add Other Charges form. When set, charges with a specific due date are billed separately from the default-due-date batch, allowing e.g. "OTH A and B on July 5, OTH C on July 14" to generate as two distinct bills.
- **Billed flag on pending charges**: Once pending charges are included in a generated bill they are marked `billed = true`. The staged charges list shows a "Billed" badge and hides the trash button for these rows. Unbilled (draft) pending charges remain deletable.
- **Delete guard**: `removePendingOtherChargeAction` now explicitly blocks deletion of already-billed charges server-side.
- **Missing UPDATE RLS policy**: `pending_other_charges` had read/insert/delete policies but no UPDATE policy, so the `billed = true` update during bill generation silently affected 0 rows under RLS. Added an UPDATE policy (+ grant) mirroring the delete policy.
- **Can't re-generate Other Charges in the same month**: Ad-hoc charges now bill as their own OTH bill even when a prior OTH bill exists for the period.
- **Draft display filter**: The billing page now filters the draft staging list to `billed = false`, so generated charges appear only under Generated Bills.

### Electricity — Common Area Bug Fix & PDF Fixes

- **Common Area billing**: CommonArea sub-meters now correctly route consumption to the Common Area unit (not the FK-placeholder unit). Both billing generation and PDF generation detect `meter_type = 'CommonArea'` and `unit.type = 'Common Area'`.
- **Unit bills leaking Common Area row**: The PDF generator now excludes `meter_type = 'CommonArea'` from regular unit sub-meter queries.
- **Address "0"**: Common Area units with `door_no = "0"` no longer render "Common Area, 0, Ground Floor" — the zero is treated as absent.
- **PAN missing from electricity bill**: `panNumber` is now passed to `renderElectricityBillPdf`.
- **Title unified to INVOICE**: Electricity bill title changed from "Electricity Bill" to "Invoice".
- **Line item descriptions now bold**: Meter rows match maintenance bill style.
- **Paid / Outstanding section added**: Electricity bills now show Bill Amount (Payable) / Paid / Outstanding below the meter table.

### Mobile / Responsive

- **Association name truncation**: Caps at 140px with `truncate` in the topbar.
- **Table overflow**: `overflow-x-auto` added to all data tables across billing, payments, units, electricity, audit, notifications, and reports.
- **Dashboard header**: Uses `flex-wrap` so the duration select drops to a new line on narrow screens.

### Migrations

| Migration | Description |
|-----------|-------------|
| `20260715000003_pending_other_charges_due_date_billed.sql` | Adds `due_date date` and `billed boolean default false` columns to `pending_other_charges` |
| `20260715000004_pending_other_charges_update_policy.sql` | Adds UPDATE RLS policy + grant on `pending_other_charges` so bill generation can mark charges as `billed` |

---

## Cash Ledger UX & Form Improvements (2026-07-16)

### Cash Ledger Page

- **Default "All Units"**: Cash Ledger opens showing all transactions across all units (admins); restricted users (owner/tenant) default to their own unit.
- **Date range filter**: "From" and "To" date pickers added; "Clear" button appears when active.
- **Labelled filter toolbar**: All filters (Unit, Bill Type, From, To) have consistent uppercase labels; toolbar is contained in a muted surface for visual separation.
- **Restructured table columns**: Merged Debit + Credit into a single color-coded **Amount** column. Replaced Description with **Paid By**. Column order: Unit (All mode only) · Date · Type · Bill Type · Amount · Paid By · Balance (single-unit only).
- **Context-aware balance summary**: "All Units" mode shows focused cards — "Units in Advance (N) ₹X CR" and "Units with Dues (N) ₹Y DR" — zero-value cards are hidden; both-zero state shows a "All settled" indicator. Single-unit mode shows a single Advance/Outstanding/Settled chip.
- **Running balance retained** in single-unit view as the rightmost column.
- **UX polish**: row hover states, consistent column padding, dead-code colSpan ternary removed, count badge hidden on single-unit summary card.

### Add Cash Ledger Entry Dialog

- **Paid By and Payer Name hidden for Due entries** — these fields only apply to Advance Payments.
- **Contextual date label**: "Due Date" for Due entries; "Paid On" for Advance Payments.
- **Contextual submit button**: "Record Due" or "Record Payment".
- **Contextual dialog description and notes placeholder** change based on entry type.
- **Form resets on dialog close** (cancel or submit) — prevents stale state on reopen.
- **Amount field** starts empty instead of pre-filling 0.

### Other Charges PDF

- Descriptions no longer append " for [Month Year]" — plain charge name (e.g. "Sinking Fund") shown as-is. Port of main branch fix to cash-ledger-feature branch.

_Last updated: 2026-07-16_

---

## Cash Ledger — UX Overhaul, Data Fixes & Code Quality (2026-07-16)

### Dashboard — Per-Unit Balance Cards

- **Cross-unit aggregation bug fixed**: Advance credit on Unit A no longer cancelled dues on Unit B. Balances are now computed per `(unit_id, bill_type)` independently.
- **Inline per-unit display**: Balance cards render inside each unit's section — dues and credit are shown against the correct unit, never aggregated across units.
- **"Pay now" button**: Styled with brand primary (`bg-primary text-primary-foreground`) instead of hardcoded orange. Links to the Payments page.
- **Color compliance**: All hardcoded colors (`text-emerald-600`, `bg-orange-600`, `border-slate-*`) replaced with semantic Tailwind tokens and CSS variables (`var(--sidebar-foreground)` for brand-gold text tone).

### Cash Ledger Page

- **Server-side prefetch**: Initial entries are fetched in parallel with units on the server. Table renders immediately without a client-side waterfall on load (`useRef` skip pattern for first `useEffect`).
- **Owners/tenants redirected**: `prop_owner` and `tenant` roles are now redirected to the Payments page (their balance is visible there); the Cash Ledger is an admin/operator tool.
- **Split "Paid By" / "Notes" columns**: The combined "Description/Paid By" column is now two separate columns — "Paid By" and "Notes" — eliminating confusion where notes text appeared under "Paid By" for Due entries.
- **Nav cleanup**: Cash Ledger removed from `prop_owner` and `tenant` nav allowlist.

### Payments Page — Cash Ledger Dues Section

- **Dues visible for all roles**: Owners/tenants now see their outstanding Cash Ledger dues in the Payments page via per-unit aggregation (no cross-unit netting).
- **`advance_applied` factored into outstanding**: Bills that had advance auto-applied were incorrectly showing ₹X outstanding alongside "Paid" status. Outstanding now correctly computed as `total_amount − paid_amount − advance_applied` across the query SELECT, type interface, metric totals, and per-row calculation.
- **Adaptive title**: Section shows "Pending dues" for owners/tenants, "Cash ledger dues" for admins.
- **Unit column hidden** for single-unit owners/tenants.
- **Table padding & typography**: Consistent `py-3 pl-4/pr-4` cell padding; outstanding amounts rendered `font-bold tabular-nums text-destructive`.
- **Action label**: Button reads "Record payment" (was "Pay").

### Code Quality & Deduplication

- **`apps/web/lib/bill-type-labels.ts`** (new): Shared `BILL_TYPE_LABELS` map and `billTypeLabel()` helper — extracted from two files where it was duplicated.
- **`apps/web/lib/cash-ledger-aggregation.ts`** (new): Shared `loadUnitLedgerBalances()` — per-unit credit/due aggregation extracted from two files where the algorithm was duplicated. Exports `UnitCashLedgerBalance` and `CashLedgerLineBalance` interfaces.
- Removed dead `AccountBalanceCard` component from `association-dashboard.tsx`.
- Removed `isRestricted` prop from `CashLedgerSection` (concept no longer needed after redirect).
- Removed `Badge` import from `cash-ledger-dues-section.tsx` (replaced with inline `<span>`).

_Last updated: 2026-07-16_

---

## Razorpay Payments + Cash Ledger Integration (2026-07-16)

### Razorpay — Association Gateway Config UI

- **`PaymentGatewayCard`** (new): Association admins can configure their own Razorpay credentials (Key ID, Key Secret, Webhook Secret, active toggle) from the Association Settings page. Key Secret is write-only — never fetched to the client.
- **`upsertPaymentGatewayAction`**: Server action using `getSupabaseServerAdminClient` (bypasses RLS) to insert or update `association_payment_gateways`. Key Secret is only required on first-time insert; updates leave the secret unchanged if the field is left blank.
- **Settings page fix**: All 7 previously-missing fields (`email`, `phone`, `bank_account_name`, `bank_account_number`, `bank_name`, `bank_ifsc`, `bank_branch`) restored to the `AssociationForm` prop after a merge conflict accidentally dropped them.

### Razorpay — Async Webhook Safety Net

- **`POST /api/billing/razorpay/webhook`**: Handles `payment.captured` events. Verifies HMAC-SHA256 signature via the association's `webhook_secret`. Reads `bill_ids`, `association_id`, `paid_by_role` from order `notes`. Calls `record_payment()` via service role (no user session). Fully idempotent — `payments_razorpay_bill_uniq` index prevents duplicate recording if `/verify` already fired.
- **`create-order/route.ts` updated**: Embeds `notes: { bill_ids, association_id, paid_by_role }` in every Razorpay order so the webhook can identify bills without a separate DB lookup.
- **Migration `20260709200000_record_payment_webhook_bypass.sql`**: Makes `recorded_by` nullable on `record_payment()` and grants EXECUTE to `service_role` so the webhook route can record payments without an authenticated session.

### Payments Page — Overdue Bills

- **Overdue filter**: `Overdue` status added to the bill filter in `payments-section.tsx` so overdue bills appear when the Overdue tab is selected.
- **Pay All includes Overdue**: The "Pay All" button now covers `Unpaid | Partial | Overdue` bills (was `Unpaid | Partial` only).
- **Units page badge**: `.eq('status', 'Unpaid')` widened to `.in('status', ['Unpaid', 'Partial', 'Overdue'])` so the unpaid-bills badge on the Units page counts overdue bills too.

### Cash Ledger — Import Date Fix

- **`FALLBACK_DATE` was hardcoded** to `'2026-06-30'` in both `cash-ledger-actions.ts` and `import-cash-ledger-dialog.tsx`. Import rows without a `paid_on` date were silently backdated to June 30. Fixed to `new Date().toISOString().slice(0, 10)` (today's date at import time).

### Migrations

| Migration | Description |
|-----------|-------------|
| `20260709200000_record_payment_webhook_bypass.sql` | Makes `recorded_by` nullable; grants `record_payment()` EXECUTE to `service_role` for webhook use |

_Last updated: 2026-07-16_

---

## Payments Page UX Overhaul + Razorpay Due Payments (2026-07-17)

### Payments Page — Owner/Tenant View

- **Header subtitle**: Changed to "Bills and payment history for your unit(s)." for owner/tenant view.
- **Duration default**: Owners/tenants now default to "FY 2026-27" (this_fy) instead of "All Time" — avoids large data loads and scopes the metric cards meaningfully.
- **Metric cards**: "Collected" renamed to "Paid" and "Outstanding" renamed to "Bills due" for the owner view — language matches the resident's perspective.
- **"Type" column**: New column showing bill type (Electricity, Maintenance, Other Charges) in the bills table.
- **Outstanding column**: Paid rows now show "—" instead of "₹0" to reduce noise.
- **Overdue row highlight**: Overdue bill rows get a subtle red/amber background tint.
- **Pay button**: Changed from outline to filled primary style for stronger affordance.
- **Payment history button**: Shows `👁 1 payment` / `👁 2 payments` ghost button with eye icon; hides when no payments exist.
- **Bill No. column**: Truncated with ellipsis and `title` tooltip for long bill numbers.
- **URL sync**: Clicking a unit tab (Unit 404, Unit A1) now syncs the `?unit=` query param so the view is deep-linkable and survives browser back/forward.

### Pending Dues — Owner Pay Now Button

- **`RazorpayDueCheckoutButton`** (new component): Prop owners can now pay cash-ledger dues directly online via Razorpay, same as bill payments.
- **`POST /api/billing/razorpay/create-order-due`** (new route): Creates a Razorpay order for a ledger due (unit + bill_type + amount). Validates caller owns/rents the unit. Embeds `is_due: 'true'`, `unit_id`, `bill_type` in order notes for the webhook.
- **`POST /api/billing/razorpay/verify-due`** (new route): Synchronous post-payment verification — same HMAC signature check as `/verify`, validates unit ownership, calls `record_due_payment_webhook()` via admin client to immediately record the payment and credit the cash ledger. The async webhook remains as a safety net for network failures.
- **Webhook extended**: `POST /api/billing/razorpay/webhook` now handles `is_due` orders as a fallback by calling `record_due_payment_webhook()`; idempotent via `razorpay_payment_id` unique index.
- **`CashLedgerDuesSection`**: Added `canPay` prop; renders the Pay button for owner/tenant when gateway is active.
- **Pending dues description**: Changed to "Other dues raised by the association." (was too technical for owner view).

### Code Quality

- **Pre-existing TypeScript errors fixed**: `razorpay-checkout.tsx` had a `declare global { interface Window }` augmentation that conflicted with TypeScript's ambient module merging, causing TS2717 + TS2339 errors (hidden by Turborepo cache). Replaced with a local `RazorpayConstructor` type alias and `(window as any)` cast — identical runtime behaviour, no more type errors.

### Migrations

| Migration | Description |
|-----------|-------------|
| `20260717100000_razorpay_due_payment.sql` | Adds `razorpay_payment_id` to `cash_ledger_payments`, extends mode check to include 'Razorpay', grants service_role INSERT on ledger tables, adds `record_due_payment_webhook()` function |

### Paid Dues Visibility

- **Payments page — Dues section**: The "Pending dues" section now shows both outstanding and paid dues together. When any paid history exists, the section title becomes "Dues" and the description updates to "Dues raised by the association and your payment history." New **Status** column (Outstanding badge in red / Paid badge in green) and **Paid on** column (date of payment). Section renders even when all dues are cleared, so payment history is never hidden.
- **Owner Dashboard — My payments widget**: Cash ledger due payments now appear alongside bill receipt payments. Shown as **"Due · {Bill Type}"** with mode and date, clearly distinct from receipt-based entries (no receipt download button). "View all" link threshold correctly counts due payments. Owners can now confirm their due payment immediately from the dashboard without navigating away.

### Statement Page (Owner/Tenant)

New dedicated page at `/statement` for prop owners and tenants — a cash ledger passbook showing all financial activity on their unit(s).

**Features:**
- **Per-unit tabs** for owners with multiple units (e.g. Unit 404 / Unit A1) — isolated balances, no cross-unit mixing
- **Summary cards**: Closing balance (neutral "All settled" when ₹0, green = credit, red = due), Total credits, Total debits — updates live with filters
- **Bank passbook table**: Date · Description · Debit · Credit · Balance columns; newest first; running balance on every row; consistent `text-sm` font across all columns
- **Opening balance row**: When filtering by FY, shown only when non-zero — shows balance carried forward from prior periods
- **FY filter**: Defaults to current financial year; all historical FYs in dropdown; displays "FY 2026-27" not raw key
- **Bill type filter**: Maintenance / Electricity / Water / etc.; displays human-readable labels
- **Human-readable descriptions** from `entry_type`: "Maintenance due raised", "Advance deposited — Maintenance", "Due payment for Maintenance"
- **Payment mode sub-line**: For due_payment entries, shows "Paid via Razorpay" (Razorpay ref stripped from display; full ref still stored in `cash_ledger_payments`)
- **Card title**: "Ledger activity" with transaction count in description; no redundant unit name in card header
- **Navigation**: "Statement" nav item added for prop_owner and tenant roles only (admins use the full Cash Ledger page)

### Owner/Tenant Dashboard — Instant Unit Filter

- **Unit pill filter** added to the Owner Dashboard and Tenant Dashboard: "All units" + one pill per unit. Default is "All units" showing all units stacked with unit headers and dividers.
- **Instant switching** — unit filtering is now entirely client-side. All data is fetched once on server load; pill clicks trigger a local `useState` update with zero network round-trips. Eliminates the 300–800ms server re-render that occurred with the previous URL-param approach.
- **Architecture**: Per-unit rendering logic extracted from the server component into a new `OwnerUnitsView` client component (`owner-units-view.tsx`). Server component now purely fetches and passes serialised data as props.

### Migrations

| File | Description |
|---|---|
| `20260717110000_clean_razorpay_notes.sql` | Updates `record_due_payment_webhook` to store `'Paid via Razorpay'` in `cash_ledger.notes` instead of the raw payment ID (ID already stored in `cash_ledger_payments.razorpay_payment_id`) |

### Admin Dashboard — Instant Duration Filter

- **Duration switching is now instant** — all 7 duration periods (Current Month, Last Month, 3 Months, 6 Months, This FY, Last FY, All Time) are prefetched in parallel at page load. Switching between periods requires zero network round-trips.
- **Architecture**: New `AdminOverviewPanel` client component (`admin-overview-panel.tsx`) accepts `metricsByDuration: Record<string, OverviewMetrics>` and manages active duration with `useState`. Server component fetches static data (units, mescom, audit log) + 7 parallel bill queries in a single `Promise.all`, then passes the complete result to the client component. The inline admin render JSX and the `DashboardDurationSelect` URL-navigation approach have been removed from the server component.
- **No regression**: URL param `?d=` is still accepted for deep-linking; the client component uses it as `initialDuration`.

### Razorpay Payment Flow — Performance & UX Overhaul

**"Preparing..." eliminated (eager order pre-creation):**
Both `RazorpayCheckoutButton` and `RazorpayDueCheckoutButton` now pre-create the Razorpay order on component mount in the background. By the time the user clicks Pay, the order is already ready — the Razorpay modal opens in under 200ms with no visible "Preparing..." state.

**"Verifying..." eliminated (optimistic UI):**
After the user completes payment in the Razorpay modal, the button resets and a success toast appears immediately. The `/verify` (or `/verify-due`) API call runs in the background fire-and-forget. The async webhook is the safety net. Users no longer wait 6–8 seconds staring at a spinner.

**API route parallelization:**
All 4 Razorpay API routes (`create-order`, `create-order-due`, `verify`, `verify-due`) were refactored to fire DB queries in parallel using `Promise.all`. Sequential round-trips reduced from 5–6 to 2 batches. `record_payment` RPC calls for multi-bill Pay All are now also parallel.

**Admin dashboard — recent activity errors filtered:**
The recent activity widget now excludes audit log entries whose action or summary indicate errors (`%failed%`, `%error%`, `Failed%`). Failed Razorpay webhook recording attempts no longer pollute the feed.

### Statement Page — UX Improvements

- **Charge names instead of "Other Charges"**: Bill line item descriptions are now fetched alongside bills. For `other_charges` bill type, the actual charge name(s) (e.g. "Water Charges, Parking Fee") are surfaced in the description column, replacing the generic "Other Charges" label. GST/tax line items are excluded from the name.
- **Payment subtext clarified**: For bill payments, the subtext now shows `TPC/26-27/OTH/000069 · Paid via Razorpay` — bill number and mode together. For cash ledger due payments, shows `Paid via Razorpay · Applied to outstanding balance`.
- **Page description fixed**: "chronological order" changed to "Most recent transactions first."
- **Pay CTA on closing balance**: When balance is negative (amount due), a red "Pay now →" link appears inline, navigating directly to the Payments page.
- **Dynamic credits sub-label**: Shows "Payments received", "Advance deposits", or "Advances & payments" based on what credit types are actually present in the filtered view.
- **Date group headers**: Shaded header rows group same-date transactions — reduces visual noise and makes scanning faster.

_Last updated: 2026-07-18_

---

## Payment Gateway Security — Write-Once Credentials (2026-07-17)

### Security hardening: Razorpay gateway config is now write-once

The association payment gateway panel has been redesigned to eliminate an in-place credential edit attack surface. Previously, an association admin (or an attacker who compromised an admin account) could silently swap the Razorpay Key ID to redirect all payments to a different Razorpay account without re-entering the secret.

**What changed:**

- **Create-only form** — the gateway setup form is shown only when no gateway exists. All three fields (Key ID, Key Secret, Webhook Secret) are required at creation time; there is no partial-save path.
- **Read-only configured view** — once saved, credentials are displayed as masked values only (`rzp_live_••••••••XXXX` for Key ID, bullet placeholders for secrets). No field is editable.
- **Pause/resume toggle** — admins can still enable or disable online payments inline without touching credentials. This is the only in-place mutation allowed.
- **Delete to rotate** — to change credentials, the admin must explicitly delete the gateway (with a confirmation dialog) and then re-create it. This makes credential rotation a deliberate, auditable act.
- **Security notice on create form** — a contextual warning on the create form tells the admin that credentials cannot be viewed or edited after saving.

This pattern mirrors industry-standard API key UX (GitHub tokens, Stripe keys, AWS access keys).

_Last updated: 2026-07-18_

---

## Payment Gateway — Removed from Super Admin Panel (2026-07-18)

### Product decision: association admin is the sole owner of payment credentials

The super admin panel previously had full write access to Razorpay credentials (create, toggle, delete) for any association. This created split ownership, audit ambiguity, and a platform liability — the platform operator could silently write credentials tied to an association's bank account.

**What changed:**

- **Super admin panel** — payment gateway section **removed entirely**. The super admin has no business viewing or acting on association-level payment credentials.
- **Association admin** — sole owner of their gateway (create / toggle / delete from Settings → Association → Payment Gateway).
- **Super admin server actions** — `adminCreatePaymentGatewayAction`, `adminTogglePaymentGatewayAction`, and `adminDeletePaymentGatewayAction` removed. The gateway query is removed from the admin account page data fetch.
- **`AdminPaymentGatewayCard` component** — deleted.

**Why:** A read-only status card in the admin panel gives the operator nothing actionable — if a customer needs help, support directs them to their own settings. The section added noise without signal. Removing it keeps the admin panel focused on platform-level concerns only.

_Last updated: 2026-07-18_

---

## Statement Page — Rebuilt from Bills + Payments (2026-07-18)

### Root cause fixed: Razorpay payments were invisible on the Statement page

The Statement page previously read exclusively from the `cash_ledger` table. Only the due-payment webhook (`record_due_payment_webhook`) wrote to that table — regular Razorpay payments recorded via `record_payment()` wrote to the `payments` table only. As a result, any payment made through the Razorpay checkout (including "Pay All") was absent from the Statement even though it showed correctly on the Payments page.

**What changed:**

- **Statement data source** — rebuilt from `bills` (debit entries) + `payments` (credit entries) as authoritative sources. `cash_ledger` is still queried but only for advance deposits and advance-applied entries, which have no equivalent in the bills/payments tables.
- **All payment paths now appear** — Cash, UPI, Razorpay, webhook — any payment recorded against a bill shows on the Statement automatically, regardless of how it was captured.
- **Richer entry descriptions** — dues show the bill number as a sub-line; payments show the payment mode ("Paid via Razorpay", "Paid via Cash", etc.).
- **Copy cleanup** — "Ledger activity" renamed to "Transaction history"; "No ledger activity for this period" → "No transactions for this period."
- **No DB migration required** — purely a query and presentation change.

_Last updated: 2026-07-18_

---

## Cash Ledger — Performance Fix (2026-07-18)

### Root causes

The Cash Ledger page was slow to load because:

1. **Full-table initial fetch** — the server prefetch queried all entries for the association with no date filter, returning potentially thousands of rows before the page could render.
2. **Extra auth round-trip on every filter change** — `getCashLedgerEntriesAction` called `getAssociationRole()` (a DB query) before the data query on every client-side filter change.
3. **Missing DB index** — the `cash_ledger` table had no index on `(association_id, entry_date)`, causing Postgres to scan the full table.

### What changed

- **Default to current financial year** — the initial page load now scopes the prefetch to the current FY (Apr 1 – Mar 31). The filter toolbar pre-populates with these dates so the client state matches the server-rendered data. Users can clear the dates to view all-time history.
- **Direct Supabase query on page load** — replaced the `getCashLedgerEntriesAction` call in the page server component with an inline query. Authentication is already proven by `requireRole`; calling the Server Action re-ran `getAssociationRole` (an unnecessary DB round-trip).
- **New DB index** (`20260717192130_cash_ledger_perf_index.sql`) — composite index on `cash_ledger(association_id, entry_date DESC, created_at DESC)` so all filtered queries use an index scan instead of a seq scan.

**Net effect:** Initial page load is noticeably faster (fewer rows fetched + index scan); filter changes are also faster (auth re-check eliminated).

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260717192130_cash_ledger_perf_index.sql` | Composite index on `cash_ledger(association_id, entry_date DESC, created_at DESC)` |

_Last updated: 2026-07-18_

---

## Statement Page — UX Overhaul (2026-07-18)

A comprehensive UX pass on the Statement page (`/statement`) addressing visual hierarchy, information density, and usability.

### Visual hierarchy

- **Closing balance card** is now full-width on mobile (`col-span-2`) and uses a colored left border (red when amount is due, green when credit available) to immediately draw the eye.
- Balance number bumped to `text-3xl` (vs. `text-2xl` on the other two cards); "Amount due / Credit available" label now matches the balance color for immediate clarity.
- Total Credits and Total Debits sit side-by-side below the closing balance on mobile — secondary info after the headline number.

### Pay CTA

- "Pay now" button changed from **red (destructive)** to **amber** — a call-to-action, not an alarm.

### Transaction table

- **Removed the empty DATE column** — date group headers already show the date; the redundant column and header are gone. Table is now 4 columns (Description, Debit, Credit, Balance).
- **Transaction type badges** added to each row: color-coded chips (`Due` red, `Payment` green, `Advance` blue, `Applied` purple, `Reversal` orange) for instant visual scanning without reading text.
- **Bill number subtext** made lighter (`text-muted-foreground/60`, `text-[11px]`) — visible when needed, invisible at a glance.
- **Period totals footer row** added at the bottom of the table: Debit total, Credit total, and closing balance in a muted summary row.

### Filters

- **URL-synced filters** — FY, bill_type, and unit selection are reflected in the URL via `window.history.replaceState` (no server re-render). Bookmarking a filtered view preserves the selection; the server passes initial values via `searchParams` props.
- **FY dropdown with transaction counts** — non-current FYs show ` · N` count to hint at older history volume.
- **"Other Charges" filter shows actual charge names** — the filter option for `other_charges` now shows real line-item descriptions (e.g. "Water Charges, Parking Fee") matching what users see in the table.
- Card header description now shows the active period label (e.g. `FY 2026-27 · 14 transactions`).

### Copy fix

- Total Debits sub-label changed from "Dues & applied advances" → **"Bills raised this period"**.

---

## Razorpay Payment Reversals / Refunds (2026-07-18)

### Problem

When a Razorpay payment was reversed or refunded (e.g. a test charge reversal from the Razorpay dashboard), the UI showed no indication — the bill remained marked as Paid, the cash-ledger due stayed settled, and the statement showed no reversal entry.

### What changed

**Database (`20260718000001_payment_reversal.sql`)**

- `payments.status` column added (`active` | `reversed`, default `active`)
- `payments.reversed_at` column added (timestamp, nullable)
- `cash_ledger_payments.status` and `cash_ledger_payments.reversed_at` added with the same semantics
- `sync_bill_payment_status` trigger updated to only sum `active` payments — reversing a payment now automatically reverts the bill to Unpaid / Partial
- New `record_payment_reversal(p_razorpay_payment_id)` function (security definer, granted to `service_role`) that marks matching rows as reversed and, for cash-ledger due payments, inserts a reversal debit entry in `cash_ledger`
- `UPDATE` privilege on `payments` and `cash_ledger_payments` granted to `service_role` for the webhook

**Webhook (`/api/billing/razorpay/webhook`)**

- Now handles `refund.processed` events in addition to `payment.captured`
- On refund: looks up the original payment's `association_id` (from `payments` or `cash_ledger_payments`), verifies the webhook signature, then calls `record_payment_reversal()`
- Idempotent: re-processing the same refund event is safe (rows already reversed are skipped)

**Statement page**

- Reversed payments appear with a strikethrough description and a red **Reversed** badge
- A matching "Payment reversed" debit row is emitted on the reversal date so the running balance correctly reflects the refund
- Reversal debit rows show with description "X payment reversed" and subtext "Refunded by Razorpay"

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260718000001_payment_reversal.sql` | Adds `status`/`reversed_at` to `payments` + `cash_ledger_payments`; updates trigger; adds `record_payment_reversal()` |

_Last updated: 2026-07-18_

---

## Advance Credit — Retroactive Application & Payment Correctness (2026-07-18)

### Root cause fixed: advances stranded while bills stayed overdue

Advances were only ever applied to a bill **at generation time** (inside `create_bill_with_items`). An advance deposited *after* a bill was generated sat idle as credit while that bill stayed Unpaid/Overdue. Real symptom: a unit holding a ₹10,000 advance was still shown ₹7,000 overdue and prompted to "Pay All", because nothing re-applied the later advance to the already-generated bills.

**What changed:**

- **Retroactive advance application** — new `apply_available_advance()` (guarded, admin/billing-operator only) + internal worker `_apply_advance_internal()` apply a unit's available advance to its outstanding bills of the **same bill-type, oldest-first**, writing the same `advance_applied` ledger debit + bill status update as the generation-time path. Called whenever an advance is deposited (manual **Add Entry** and **CSV import**).
- **Scoped backfill (verification-first)** — the migration's backfill is deliberately limited to the `sandbox-residency-test` association so it could be verified safely on the shared remote DB before touching real data. Verified on Unit 111: the ₹10,000 Other-Charges advance was applied to bills `OTH/000008` (₹5,000) and `OTH/000009` (₹500) → both **Paid**, ₹4,500 credit remaining; the ₹1,500 Maintenance bill correctly stays due. The full all-association backfill will follow in a separate migration.
- **Net-first overdue** — because applied advances flow into `bills.advance_applied`, the existing `recompute_overdue_bills()` (which already excludes advance-covered bills) no longer flags a bill as Overdue when advance credit covers it.
- **"Pay All" double-charge bug fixed** — the payable-bills computation subtracted only `paid_amount`, ignoring `advance_applied`; it now subtracts both, so advance-covered amounts are never re-charged.
- **Copy fix** — advance-credit hint changed from "Auto-applied to your next bill" to "Automatically applied to your bills of the same type" to reflect the actual (now retroactive, bill-type-scoped) behavior.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260718050936_apply_advance_to_outstanding_bills.sql` | Adds `_apply_advance_internal()` + guarded `apply_available_advance()`; backfills existing advances against outstanding bills (oldest-first, per bill-type) |
| `20260718052826_backfill_advance_all_associations.sql` | Full all-association advance backfill (idempotent — zero-balance assocs are no-ops) |

---

## Migration Ordering Fix (2026-07-18)

**Problem:** `20260723000000_cash_ledger.sql` has a later timestamp than several migrations that `ALTER` or reference `cash_ledger`/`cash_ledger_payments` (e.g. `20260717100000`, `20260717110000`, `20260718000001`). On a fresh `supabase db reset`, migrations replay in filename order, so those ALTER statements fail because the tables don't exist yet. Remote was unaffected (migrations were applied in historical order, not replayed from scratch).

**Fix:**
- New bootstrap migration `20260716100000_cash_ledger_bootstrap.sql` creates both tables with `CREATE TABLE IF NOT EXISTS` at a timestamp before all dependent migrations.
- `20260723000000_cash_ledger.sql` updated to use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` so it becomes a safe no-op when the bootstrap has already run (fresh reset), while remaining the canonical source of policies and functions.
- When pushed to remote, only the bootstrap migration runs (as a no-op `IF NOT EXISTS`) — the remote DB and its migration history are not disrupted.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260716100000_cash_ledger_bootstrap.sql` | Bootstrap: creates `cash_ledger` + `cash_ledger_payments` with `IF NOT EXISTS` to fix `db reset` replay order |

---

## UX & Performance Fixes (2026-07-18)

### Add Unit — Performance
- `logAuditEvent` is now fire-and-forget (`void`) in `createUnitAction`. Audit logging no longer blocks the server action response, cutting perceived latency by one full DB round-trip.

### Cash Ledger — Paid By Race Condition
- Fixed a stale-fetch race condition in the "Add Cash Ledger Entry" dialog. Rapid unit switching could cause an older in-flight fetch to overwrite the result from a newer one, hiding the owner in the "Paid By" dropdown. An `ignore` flag with effect cleanup now discards stale responses.
- The Owner and Tenant `SelectItem` options now remain rendered while members are loading (when `paid_by_type` already matches that role), preventing Radix from losing the selected value during the loading state.

### Cash Ledger — Import Dialog Layout
- Import preview table widened (`max-w-2xl` → `max-w-3xl`) and given `min-w-max` so all 7 columns render at their natural width.
- Added `overflow-x-auto` to the table wrapper so content scrolls horizontally instead of clipping.

### Navigation — Statement Hidden from Assoc Admin
- "Statement" nav item removed from the `assoc_admin` sidebar; it is now exclusive to `prop_owner` and `tenant` roles.

### Dashboard — Advance Credit / Pending Dues Type Visibility
- Advance Credit and Pending Dues cards now always show the per-type breakdown, even when there is only a single bill type. Previously, a single-type advance (e.g. ₹3,000 for "Other Charges") showed no type label — owners had no context for what the credit applied to.

_Last updated: 2026-07-18_

---

## Mobile Responsiveness — Cash Ledger & Navigation (2026-07-19)

### Sidebar — Hamburger Now Visible on Mobile
- Changed the mobile sidebar toggle from `variant="ghost"` (invisible at rest on white/cream topbar) to `variant="outline"` with an explicit border, making it clearly identifiable as a tappable button.

### Cash Ledger — Filter Bar Mobile Layout
- Unit and Bill Type selects now use `w-full` on mobile, snapping to fixed widths on `sm+`.
- Date range wrapper changed to `flex-wrap` so FROM / TO inputs break to a new line on narrow screens instead of pushing the Clear button off-screen.
- Import CSV and Add Entry buttons now stretch to fill the full row width on mobile (`flex-1`) and revert to auto-width on larger screens.

### Cash Ledger — Table Horizontal Scroll on Mobile
- Added `min-w-max` to the ledger table so it expands to its natural content width. Previously `w-full` constrained the table to the container and the `overflow-x-auto` wrapper had nothing to scroll, causing columns to be cut off.

_Last updated: 2026-07-21_

---

## Email Templates — Ooruda Brand Redesign (Jul 21, 2026)

### Changes

- **Shared components** (`wrapper`, `header`, `content`, `footer`, `heading`, `cta-button`, `body-style`): Full redesign with Ooruda brand — amber `#FCD469` header bar with "ooruda" wordmark + "Property Management" tagline, white content card, amber CTA button, minimal footer with copyright and `hello@ooruda.com`
- **OTP email**: New layout with amber code box (large monospace OTP, amber background), Ooruda-branded subject ("Your Ooruda sign-in code"), clear expiry note, and security disclaimer
- **Invite email**: Updated subject, heading, copy, and CTA ("Accept Invitation") with Ooruda branding; plain-text link fallback preserved
- **Account delete email**: Updated all copy to Ooruda voice and tone
- **All locale files** (`otp-email.json`, `invite-email.json`, `account-delete-email.json`): Rewrote copy — action-first subjects, friendly tone, Ooruda-specific wording

### Migrations Changelog

_No new migrations in this release._

_Last updated: 2026-07-21_

---

## v1.2 — Super Admin Polish, Units UX & Sinking Fund (2026-07-21)

### Super Admin Panel — Association-Centric Language

- **Accounts page defaults to Associations tab** — previously defaulted to "All"; now opens on the Associations tab directly.
- **Tab switching performance** — `useTransition` keeps current content visible during navigation; `router.prefetch` on mount pre-warms RSC payloads for all three tabs. Active tab stays enabled while sibling tabs are disabled during the transition. A progress bar appears below the filter row while switching.
- **Terminology cleanup** — "Team Members" → "Members", "Team Accounts" → "Associations", "Delete Team Account" → "Delete Association" throughout the super admin UI.
- **Subscriptions removed** — `SubscriptionsTable` and all subscription references removed from the super admin panel (not applicable to Ooruda).
- **Open Workspace button** — promoted to primary button with an `ExternalLink` icon; label shortened to "Open Workspace".
- **Test badge on Associations** — associations marked `is_test = true` now display an amber "Test" badge in the admin table (previously only personal accounts had test badges).

### Units Page

- **Status column moved** — Status badge now appears immediately after Area (before Owner), improving scannability.
- **Filter chips simplified** — removed the non-functional "Ground Floor" and "Overdue" filter chips; active filter set is now: All · Occupied · Self Occupied · Rented · Vacant.

### Sinking Fund — New Bill Type

A new `sinking_fund` bill type (`SNK/` prefix) has been introduced. It behaves like Other Charges — ad-hoc, admin-staged, no frequency schedule — allowing associations to collect sinking fund contributions on any cadence (monthly, quarterly, annual) with the description field for period context (e.g. "Q1 Apr–Jun 2026").

**Where it appears:**
- **Cash Ledger** — Bill Type dropdown includes "Sinking Fund" for both Due and Advance Payment entries.
- **Billing** — "Sinking Fund" button in the header opens a staging dialog (mirrors Other Charges dialog). Staged charges appear in the Draft Bills tab under a dedicated Sinking Fund section. "Generate Bills" dialog and Bill Type filter both include Sinking Fund.
- **Payments** — Bill Type filter includes Sinking Fund.
- **Bills filter** — Generated Bills type filter includes Sinking Fund.
- **Receipts / Statements** — `bill_type_labels` and `bill_filter_items` updated; Sinking Fund appears wherever bill type is shown.

**Generation logic** — `billing-actions.ts` fetches `pending_sinking_fund_charges` for the period, builds SNK line items per unit, generates `SNK/` bills, then marks all staged charges as billed. Due date is sourced from the staged charge's `due_date` field (falls back to the Other Charges due date).

### Migration

| Migration | Description |
|---|---|
| `20260721000001_sinking_fund.sql` | Adds `sinking_fund` charge type to `seed_builtin_charge_types()`, backfills all existing associations, creates `pending_sinking_fund_charges` table with full RLS |
| `20260721000002_fix_sinking_fund_rls.sql` | Replaces incorrect RLS policies (wrong UUID comparison) with correct `association_role()` pattern — matches `pending_other_charges` policies |

_Last updated: 2026-07-21_
