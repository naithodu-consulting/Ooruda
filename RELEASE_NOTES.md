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

## Release v3.1 — Performance & Bug Fixes (Jul 12, 2026)

### Billing & Payments: Client-Side Filtering (instant results)

Billing and payments filter dropdowns previously triggered a full server round-trip + 2–3 sequential Supabase queries on every change, causing 2–3 second delays. Filters are now instant:

- **Server pages simplified**: load all bills in one query (with `Promise.all` for parallel independent fetches). No filter logic on the server.
- **Client-side filtering**: `BillsSection` and `PaymentsSection` hold filter state in `useState`; filtered rows, metrics, and pagination are derived via `useMemo` — zero network requests on filter change.
- **Pagination converted**: Previous/Next links (URL-based) replaced with button `onClick` state — no page reload.
- **Live metrics strip**: Bill count, collected, outstanding, and overdue counts update instantly as filters change, replacing the separate metric card grid.
- **`bill_type` column added** to `bills` table (values: `maintenance`, `electricity`, `other_charges`). Backfilled from `bill_no` patterns. Eliminates ILIKE queries entirely. Two composite indexes added: `bills(association_id, bill_type, period, status)` and `bills(unit_id, bill_type, period, status)`.
- **`create_bill_with_items` RPC updated** to accept and store `p_bill_type` directly (new bills get correct type from day one).
- **`bill-period-filter.ts`** shared utility: `getPeriodsForDuration()` extracted into `apps/web/lib/` so billing and payments use one canonical implementation.

### Invite Members: Bug Fixes

- **HTTP 300 (ambiguous function)** — Dropping `20260712000001`: old 4-arg overload of `invite_to_association_by_phone` coexisted with the 6-arg version; PostgREST returned 300. Dropped the stale overload.
- **HTTP 400 (ON CONFLICT mismatch)** — `20260712000002`: `ON CONFLICT (account_id, phone)` didn't match the partial unique index (`WHERE phone IS NOT NULL`). Fixed by adding the predicate to the conflict target.

### PDF Download: Performance & UX

- **Cached PDFs now near-instant**: Previously, even cached PDFs required the Next.js server to download the file from Supabase Storage, buffer it in memory, then stream it to the browser (~1–2s). Now the route handler generates a short-lived signed Supabase Storage URL (valid 5 min) and returns a 302 redirect. The browser downloads directly from the CDN, bypassing the Next.js server entirely.
- **Loading state on the download button**: The `DownloadPdfButton` component now uses `fetch()` + Blob URL + programmatic anchor click instead of a plain `<a href download>`. The button shows a spinner and "Generating…" label immediately on click, giving instant visual feedback for the entire generation duration. An error toast is shown if the request fails.
- **Fixed button width during loading**: The labeled download button now has a fixed width (`w-[110px]`) so switching between "Download" and "Generating…" doesn't cause the button to resize and shift surrounding layout.

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

---

## Feature Summary by Module

| Module | Status | Key Capabilities |
|---|---|---|
| **Authentication** | Complete | Phone OTP sign-in, email OTP fallback, invite-only model, complete profile flow |
| **RBAC** | Complete | 4 roles (assoc_admin, billing_operator, prop_owner, tenant), JWT hook, `requireRole()` guard, super admin |
| **Associations** | Complete | Settings (general, electricity, tax, billing), logo upload, charge type configuration |
| **Units** | Complete | CRUD, CSV import, common area type, owner/tenant assignment, unit detail + tenancy timeline |
| **Members** | Complete | Phone invitations, email invitations, role-restricted invitations, phone number normalization |
| **Electricity** | Complete | Sub-meter management, bill upload, meter readings (manual + CSV import), block rate calculation |
| **Billing** | Complete | Bill generation (maintenance, electricity, other charges), line items, PDF, filters, common area |
| **Other Charges** | Complete | Ad-hoc charges staging, flat/per-sqft split, CSV import |
| **Payments** | Complete | Record payments (cash/UPI/bank/cheque), payment history, PDF receipts, bill status auto-sync |
| **Reports** | Partial | Arrears summary, payment summary, billing overview (more report types deferred) |
| **Audit Logs** | Complete | Structured event log, all actions instrumented |
| **Notifications** | Partial | Log view with read/unread state (push delivery not yet wired) |
| **Admin Panel** | Complete | Create association, create/edit/remove users, manage roles, association permissions |
| **Dashboard** | Complete | Real-data metric cards, multi-unit billing summary, recent activity feed |

---

*Last updated: 2026-07-01 (v3.1 additions: 2026-07-01)*
