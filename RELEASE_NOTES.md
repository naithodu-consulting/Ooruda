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

### Audit Log: Search & UX Improvements

- **Search bar** added to the audit log page — filters by event name or details (URL-based, compatible with pagination).
- **Column renames**: Action → Event, Actor → User, Entity → Details, Timestamp → Date.
- **Truncated error details**: Long error messages are trimmed to 90 characters; raw JSON payloads are replaced with "An error occurred." rather than being shown verbatim.
- **New action labels** for failed events (`mescom.bill_create_failed`, `bill.generate_failed`, `payment.failed`, `bill.pdf_generated`, `receipt.pdf_generated`).

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

---

## Feature Summary by Module

| Module | Status | Key Capabilities |
|---|---|---|
| **Authentication** | Complete | Phone OTP sign-in, email OTP fallback, invite-only model, complete profile flow |
| **RBAC** | Complete | 4 roles (assoc_admin, billing_operator, prop_owner, tenant), JWT hook, `requireRole()` guard, super admin |
| **Associations** | Complete | Settings (general, electricity, tax, billing), logo upload, charge type configuration |
| **Units** | Complete | CRUD, CSV import, common area type, owner/tenant assignment, unit detail + tenancy timeline |
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

*Last updated: 2026-07-03 (v3.3)*
