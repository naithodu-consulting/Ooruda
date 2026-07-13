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

---

*Last updated: 2026-07-21*
