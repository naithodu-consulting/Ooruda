# Ooruda - Release Notes

This document covers all feature work, enhancements, and notable changes built on top of the Makerkit SaaS boilerplate. Makerkit upstream updates (framework, auth primitives, Supabase client, UI kit) are not detailed here.

---

## v2.3 - Regression Pass: Responsive, Sign-in Limits, PDF Cache & Settings Fixes - 2026-09-24

Full-app regression pass (126 automated cases, every page × role at 360/768/1280 px, all PDF types, key flows - see `apps/e2e/tests/ooruda/regression/CHECKLIST.md`) and the fixes it produced.

### Sign-in
- Rate limit reworked (`proxy.ts`): only sign-in submissions count (page loads, prefetches and redirects under `/auth` no longer do), and the limit is 20/min per IP instead of 5. One mistyped code, or several users behind one carrier/office IP, no longer locks people out.
- When the limit is hit the form now says "Too many attempts. Please try again in N seconds" and disables the button until the window resets (it previously did nothing). Other failed sends now show an error instead of failing silently.

### PDFs
- Download filenames no longer contain slashes (`SRT-26-27-OTH-000008.pdf`); cached downloads opened in a new tab were saved as `SRT%2F26-27…`.
- Cached bill / receipt / voucher PDFs are cleared when the association's branding changes (logo, name, address, GST/PAN, contact, bank details, signatory), so PDFs rendered before a logo upload no longer show the default mark. Existing caches reset once (see migration).

### Responsive / UI
- Page titles on mobile/tablet no longer indented for the (desktop-only) sidebar button - every workspace page.
- AMC contract detail: actions wrap instead of overflowing 135px on phones.
- Audit log (and super-admin Activity): details column wraps, so Status and time stay visible; every event row has an icon, errors show the warning icon first.
- Bill detail panel aligns with the bill name at all widths.
- Reports Directory KPI tiles collapse on phones; mobile top-bar avatar shows initials instead of "?".
- Date picker: month and year dropdowns in the calendar header.

### Settings
- Profile settings show only Login & Security for sign-in details: MakerKit's separate email editor and the linked-accounts card (which could only unlink phone/email sign-in) are removed; MFA is hidden until a recovery path exists.
- Fixed a hydration error (React #418) on settings pages when account data was already cached.

### Testing
- New Playwright suite `apps/e2e/tests/ooruda/regression` (`playwright.ooruda.config.ts`): page matrix per role, responsive overflow, PDF/ZIP downloads and access control, sign-in and core flows.

| Migration | Change |
| --- | --- |
| `20260924000002_invalidate_pdf_cache_on_branding_change.sql` | `invalidate_association_pdf_cache()` + triggers on `associations` / `accounts` branding columns clear cached bill, receipt and advance-voucher PDF paths; one-time reset of existing cached paths |

---

## v2.3 - Page Load & PDF Download Performance - 2026-09-24

Critical review of page load and PDF download time across all roles. No behaviour or permission changes.

### Page loads

- `requireRole` (every workspace page) now resolves role, association, account and super-admin status in **one round trip**, cached per request and shared with the layout. It was four sequential calls, one of them to the Supabase Auth server. The per-page association lookup that followed it is gone from 19 pages.
- Workspace layout: workspace, cookies, feature flags and consent load in one parallel stage (was three). Feature flags are request-cached and reused by the Expenses, AMC and Cash Ledger gates.
- Sequential DB stages cut on the heaviest pages: Payments (owner/tenant 7 → 2), Units 5 → 2, Electricity 4 → 1, Dashboard (admin: 11 queries → 5 in one stage; owner: 5 → 2), Association settings 3 → 1, unit detail and unit billing 4 → 2, Notifications 4 → 2, post-login redirect 2 → 1.
- Less JavaScript on first load: the PDF renderer no longer ships to the Dashboard, Payments, Statement and Reports pages (a bill-type label helper was pulling it in); `xlsx` loads only when an import runs; the Expenses analytics charts load only when that tab opens.

### PDF downloads

- Every download path reviewed: bill, receipt, advance voucher, advance deposit, cash-ledger receipt (by id and by receipt number), statement, expenses export, reports (all tabs + unit account statement), bills ZIP, receipts ZIP.
- The PDF renderer is loaded only when a render is needed and is warmed up while the route's queries run, so cached downloads never load it and the first render in a process no longer pays the ~1s start-up on its own.
- Cached downloads sign the Storage URL in parallel with the access check (the URL is only returned once access is confirmed). Access checks are one query plus the super-admin check instead of four sequential calls.
- Fresh renders are returned immediately and written to the Storage cache after the response.
- Advance deposits and cash-ledger receipts are now cached (content-addressed, so any change to what they print gets a new cache entry). The two cash-ledger receipt routes share one implementation.
- Receipts and the affected bill are pre-rendered right after a payment is recorded (manual, Razorpay verify and webhook), so their first download is a cache hit.
- Statement and expenses exports use the resized, process-cached logo instead of downloading and decoding the full-size original on every export. Logo fetches are time-boxed and de-duplicated.
- ZIPs: receipts ZIP now reuses cached receipts (it re-rendered every one before); receipts and vouchers build in parallel; newly rendered PDFs are cached for next time; PDFs are stored, not re-deflated; Storage downloads are time-boxed.
- Fixed: cached downloads were saved as "Download bill PDF" with no `.pdf` extension (the filename header isn't readable across the Storage redirect). The name now travels in the signed URL.
- Fixed: advance voucher PDFs were never cached (see migration below), so every download re-rendered.

Measured on a local production build: cached bill 0.1-0.3s, uncached bill 0.3s warm, receipt 0.1-0.2s, statement ~0.1s, expenses export 0.4-0.7s, reports PDF 0.8s warm, 19-receipt ZIP 0.6s, 30-bill ZIP 2.8s with 17 renders. First request on a cold process 0.9-1.4s.

### Dropdowns

- Plain `Select` dropdowns now open below their field (start-aligned) like `SearchableSelect`, instead of overlaying the trigger and hiding the label and help text above it. Done once via `@kit/ui/select`; upstream shadcn is untouched.
- Admin dialogs whose lists grow with the platform (association owner, user's association, manage-roles association) now use `SearchableSelect`.

**Deployment note:** production Supabase is in Tokyo (`ap-northeast-1`) and dev in Mumbai (`ap-south-1`). Set each Vercel project's Function Region to match (`hnd1` for `ooruda`, `bom1` for `prop-tech-dev-tool`); with the default US region every database call crosses the Pacific.

| Migration | Change |
| --- | --- |
| `20260924000001_advance_application_pdf_cache_grant.sql` | Grants `service_role` SELECT and column-level UPDATE (`pdf_url` only) on `advance_application_receipts`, so the cached voucher PDF path can be recorded |

---

## v2.3 - Typography & Colour Accessibility Pass - 2026-09-23

App-wide font audit (every screen, all four roles, desktop + 360px, plus PDFs and emails) and fixes. No database changes.

### Broken status colours fixed

- `text-success`, `bg-success`, `text-warning`, `bg-warning/*`, `text-warning-foreground` generated **no CSS** - the tokens were never registered with Tailwind. Owner Payments summary card, AMC "Urgent" badge, cash ledger "Self-paid" text/dot, admin account badges and import dialogs rendered uncoloured. Tokens (`success`, `warning`, `warning-foreground`, `danger`, `info`, new `brand-ink`) are now registered in `@theme`.
- Status shades darkened so every one clears WCAG AA (4.5:1) as text on card, canvas, muted rows and its own tint: success `#146f35`, warning `#a14a06`, danger/destructive `#b91c1c`, info `#1d4ed8`.
- ~150 hardcoded status text colours (`text-green-600`, `text-amber-600`, `text-red-600`, `text-blue-600`, …) and `text-[var(--color-*)]` workarounds replaced with the tokens; dead `dark:` text variants removed (app is light-only).

### Readability / contrast

- Brand gold was used as text (~1.4:1) in consent-gate policy links, legal-page contacts, audit "Admin" label, AMC badges, filter pills and link buttons - now the readable gold ink `--brand-ink` (6.1:1).
- Sidebar nav text and group labels darkened (`--sidebar-foreground` `#665412`, 6.7:1).
- Faded text (55–70% opacity, `/50`–`/60` muted) on metric cards, bill numbers, timestamps, counts and arrows made solid.
- Auth screen footer/tagline now readable on the gold background; chart legend labels no longer painted in their (gold/amber) series colour.
- Emails: secondary greys darkened to `#6b6b5e`; font stack gains Roboto/Helvetica/Arial. PDFs: `#888` → `#666`, status colours aligned to the app tokens.

### Type scale & consistency

- Page titles 16px bold → 20px semibold (were the same size as card titles). All card titles 16px medium (three variants before).
- All off-scale sizes removed (9, 10, 10.5, 11, 12.8, 13, 15, 22, 26px) - minimum text size is now 12px. `size="sm"` buttons are 14px like other buttons.
- Status pills and badges unified to 12px medium; table headers 12px semibold uppercase everywhere; filter labels unified; filter selects 14px.
- Hero amounts (dashboard, payments, statement) share one style: 30px bold, tabular digits. `MetricCard` values use tabular digits.
- Weight 900 now reserved for the wordmark; initials avatars and auth buttons normalised.
- Heading hierarchy: owner dashboard title is an `<h2>` under the page `<h1>`.

### Fonts

- 404 and global-error pages now render in Inter (they were falling back to the system font).
- Inter's metric-matched fallback face is now generated (reduces layout shift while the font loads).

### Em dash removal

- Every em dash removed from user-visible text: UI copy, translations, placeholders (`—` → `-` for empty values), email templates and subjects, PDF documents and edge-function messages. Prose was reworded to commas, colons or plain hyphens as appropriate.
- Also removed from code comments, developer docs, config and scripts. Already-applied migration files are intentionally left untouched.

### Other

- Dev-tool build fixed: removed a stale import of the deleted `marketing.json` messages file.

---

## v2.3 - UI Component Uplift: SearchableSelect, DatePicker, MultiSelect - 2026-09-15

App-wide replacement of plain dropdowns and native date inputs with polished, accessible shared components. No database changes.

### New shared UI primitives

- **`SearchableSelect`** (`@kit/ui/searchable-select`) - combobox-style select with inline search, keyboard navigation, and empty-state messaging. Built on the same Base UI `Combobox` primitive as the existing `MultiSelect`, so look and behaviour are consistent across the app.
- **`DatePicker`** (`@kit/ui/date-picker`) - replaces bare `<input type="date">` throughout the app. Returns a `YYYY-MM-DD` string (same shape as the native input), so no form logic changes were needed at call sites.
- **`natural-compare`** (`apps/web/lib/natural-compare.ts`) - `sortNaturally()` utility for unit numbers (`A1 < A2 < A10`), used by the reports filter bar.

### `MultiSelect` rewrite

The existing `MultiSelect` was rebuilt on `Base UI Combobox` (matching `SearchableSelect`) to replace the old hand-rolled `Popover` + button list that predated the Combobox primitive and drifted from the rest of the design system.

### `Select → SearchableSelect` migration (30+ call sites)

Plain `<Select>` replaced with `<SearchableSelect>` wherever the option list can grow or benefits from inline search:

- **Billing**: other-charges dialog, sinking-fund dialog, draft-bills period filter, generate-bills dialog, import-other-charges dialog
- **Cash Ledger**: unit filter, entry dialog
- **AMC**: add, edit, and renew dialogs; contract detail page
- **Expenses**: add and edit dialogs, expense list filter
- **Electricity**: bills section, meter readings dialog, sub-meters section
- **Payments**: pay-advance dialog, record-payment dialog
- **Units**: owner picker and tenant picker in edit-unit dialog
- **Statement**: period filter in statement table
- **Admin**: activity card, bill dispatch client

### `Input[type=date] → DatePicker` migration

Native date inputs replaced with `DatePicker` in cash ledger, expenses, electricity, and AMC dialogs - gives a consistent calendar popover and avoids browser-native date formatting inconsistencies.

### Reports filter bar refactor

`filter-bar.tsx` simplified from ~258 to ~100 lines: hand-rolled dropdown filter pills replaced with `MultiSelect` + `Select` from the shared library. Unit list now sorted with `sortNaturally` so `A2` appears before `A10`.

### Accessibility baseline

New `@layer base` rule in `makerkit.css` adds a `focus-visible` ring to all bare `<button>`, `<a>`, and `[role=button]` elements that previously had no visible keyboard focus indicator. The shared `Button`, `Input`, and `Select` components define their own rings and are unaffected.

The rule no longer sets `border-radius`. A focus style should not change an element's geometry, and for any element without a `rounded-*` utility it did.

### Fixes found while verifying the migration in the browser

None of the below were caught by type-checking - every one needed the components actually rendered.

- **Dates could be silently cleared by confirming them.** react-day-picker treats a click on the already-selected day as a toggle and hands back `undefined` (`useSingle`: "If the date is the same, clear the selection"), and `DatePicker` did not pass `required`. A user re-clicking the highlighted day to confirm it wrote an empty value instead - on Record Payment, expense Date of Payment, all four AMC dates, and electricity reading dates. On Other Charges that persists as `null`, which then feeds the `recompute_overdue_bills()` cron. Re-selecting the current day is now a no-op; clearing stays deliberate, through the existing clear affordance.
- **Hydration mismatch on every `DatePicker`.** The trigger label used `toLocaleDateString(undefined, …)`, so the server formatted in Node's locale and the browser in the user's - SSR emitted `Apr 01, 2026` against the client's `01 Apr 2026` and React threw. The locale is now pinned to `en-IN`, matching `formatDateReadable`, so a picker and a table render the same date the same way. This was the only unpinned locale in the codebase.
- **`natural-compare` had the same latent bug** - `Intl.Collator(undefined, …)` can order a list differently on the server than in the browser. Pinned to `en-IN`.
- **A set value with no matching option rendered as the placeholder.** `SearchableSelect` resolves its value by looking it up in `items`; when the lookup missed - options still loading, or the option filtered out - the trigger showed muted placeholder text, indistinguishable from an empty field, while the form still held the value. It now falls back to the raw value so the mismatch is visible rather than hidden.
- **Cash ledger date range could invert.** The To picker was bounded by `min={dateFrom}` but From had no matching `max={dateTo}`, so From could be moved past To. Unlike the statement view, the ledger has no inversion guard and simply returned nothing.
- **`MultiSelect`'s trigger was missing `type="button"`** and would have submitted any form it was placed in.

**Migrations:** none.

---

## v2.3 - Marketing SEO + Structured Data - 2026-09-10

Search-engine and social-preview work across the public marketing surface. No database changes.

### Legal pages - Privacy, Terms, Refund & Cancellation

Client-supplied legal documents (dated 9 September 2026) now back all three pages, replacing Makerkit boilerplate that read "Your terms of service content here" - text that was **live on ooruda.com/privacy-policy** until this change.

- **Three documents, real content**: Privacy Policy (17 sections), Terms of Service (21 sections), and a new **Refund & Cancellation Policy** (13 sections) at `/refund-policy` - the last of which did not exist before and is required for payment-gateway compliance.
- **Real registered-entity details throughout**: HABBAA SOLUTIONS PRIVATE LIMITED, registered office in Mangalore, with CIN and GSTIN. The previous drafts carried 13 unfilled `[PLACEHOLDER]` markers; there are now none. Contact details live in one shared component so they cannot drift between documents.
- **New top-level `(legal)` route group** using the prerendered-shell + `Suspense` header pattern rather than `force-dynamic` - legal pages are the most cacheable content on the site.
- **Typography**: the drafts styled themselves with `prose prose-slate dark:prose-invert`, but `@tailwindcss/typography` is not installed anywhere in the monorepo and `prose` appears in no other file - every one of those classes was inert, rendering each document as a flat wall of 14px text with no heading hierarchy. Replaced with explicit semantic-token styling.

### Legal link placement

The three policies are linked from the auth screens in **every** environment, and production carries them in the public landing-page footer as well.

That duplication is deliberate rather than redundant. On production, `proxy.ts` gates `/(auth|home)/*` behind the access-PIN cookie, so a visitor without a PIN never reaches the auth screens - the auth-screen links alone would leave the policies publicly unreachable, which payment gateways do not accept. The landing footer covers the public; the auth footer covers everyone already inside. Non-production has no landing page (`/` redirects to sign-in), so the auth screens are the only home the links need.

An earlier revision of this change gated the auth links behind a `NEXT_PUBLIC_ENABLE_LEGAL_LINKS_IN_AUTH` flag. That was dropped: a single mis-set environment variable would have silently removed the policy links from production, and there is no case where hiding them is desirable.

- Marketing `SiteFooter` gains the Refund & Cancellation Policy link; `/cookie-policy` was dropped from both the footer and the sitemap, since that page is still a boilerplate stub.
- Sitemap adds `/refund-policy` and stamps all three legal pages with the 2026-09-09 document date.
- The landing-page footer on `main` is updated separately - that route group exists only on `main`, since the landing page and access gate are production-only.

### Structured data

- **Organization / SoftwareApplication / WebSite JSON-LD** added to the root locale layout as a single `@graph`, with the `SoftwareApplication` and `WebSite` nodes both referencing the Organization as publisher. Gives search engines an explicit entity for the product rather than leaving them to infer one from page copy.

### Canonical URLs (bug fix)

A canonical tag pointing at the wrong URL is worse than none at all - it actively tells search engines to index something else. Two issues were caught and fixed during review:

- A site-wide `alternates.canonical` in `generateRootMetadata` would have been **inherited by every page in the app**, declaring `/pricing`, `/faq` and every blog post to be duplicates of the homepage. Removed; canonicals now belong to the pages that can state them correctly.
- Blog posts now set their own `alternates.canonical`. Note that `post.url` from the Keystatic CMS client is the **bare slug** (`my-post`), not a path - resolved against `metadataBase` it yields `/my-post`, a 404. Both the canonical and the pre-existing `openGraph.url` now build `/blog/${slug}`, matching what the sitemap emits.

### Crawl directives

- **robots.txt** now disallows `/home/`, `/admin/` and `/api/` - authenticated and internal routes that should never have been crawlable.
- **Sitemap** rewritten with per-path `priority`, `lastmod` and `changeFrequency`. Every entry previously claimed `changeFrequency: 'always'` with a `lastmod` of "right now", which search engines discount as noise. Static marketing pages now carry honest values (`/` weekly, legal pages yearly), and blog/docs entries changed from `always` to `weekly`.

### Social previews

- `twitter:site` (`@ooruda`) added to root and blog-post metadata so Twitter/X cards attribute correctly.
- Blog `openGraph.authors` set to `Ooruda`. It previously held the site URL, which reads as "the author is a website".

### Assets and accessibility

- **`site.webmanifest` had a duplicate `display` key** - `fullscreen` near the top and `standalone` at the bottom. Invalid JSON, with the winner varying by parser. The stray `fullscreen` entry is gone; installed PWA behaviour is now unambiguously `standalone`.
- **Blog cover images** accept an optional `alt` override, falling back to the post title. The previous alt text was hardcoded to `Cover Image for ${title}`, which screen readers announce as boilerplate before every heading.
- **Font weight 300 dropped** from the sans family. Verified unused - no `font-light` or `font-thin` anywhere in the codebase - so this removes a font file from the critical path at no visual cost.

**Migrations:** none.

---

## v2.3 - Electricity Reading Guards + Period Formatting - 2026-09-08

### Electricity - reading validation (data-integrity fixes)

Prompted by a production incident: one sub-meter's September reading was never saved, so its unit was billed ₹0 while the readings looked complete. Nothing stopped bills from being generated against an incomplete set.

- **Bill generation pre-flight guard**: `generateBillsAction` now refuses to generate electricity bills when any **active** sub-meter has no reading for the period, or a negative one. Names up to 5 offending meters and logs a `bills.generation.blocked` audit event. A period with *no* readings at all is deliberately exempt on an "All" run, so generating maintenance before entering readings still works exactly as before - only a partial or negative set is blocked, since that is the unrecoverable case.
- **Readings dialog - per-row guard**: Save is now disabled when any row has a current reading below its previous reading, with a live banner naming the meters. Previously only an "Invalid" badge appeared and the block-total check was the sole blocker.
- **CSV import - block-total guard**: the import now rejects the whole file when the period's resulting total would exceed the MESCOM block consumption, matching the manual dialog. The total is computed as the period's state *after* import (incoming rows plus readings already saved for meters absent from the file), so successive partial imports cannot slip past.
- **Rounding consistency**: all consumption totals and per-row consumption are rounded to 2dp at source, and that one value drives comparison, display and overage alike. Float drift previously produced a banner reading "250 / 250 units - exceeds by 0 units".

### Electricity - readings dialog UX

- **Reading fields no longer truncate**: number-input spinners hidden, padding tightened, previous/current columns widened (5rem → 6.75rem), min-charge 5.5rem → 6.5rem, dialog `sm:max-w-xl` → `sm:max-w-3xl`. 8-digit readings such as `27917.00` previously clipped to ~5 characters.
- **Mobile labels**: "Previous" / "Current" labels added below `sm:`, where the two inputs sit side by side with no arrow between them. Hidden from `sm:` up, where the column headers already do this job.

### Period formatting - app-wide

- Every user-visible period now reads **"September 2026"** instead of `2026-09` or `08/2026`: import toasts and result panels, skipped-row reasons, bill-generation errors, "bills already generated" errors, "bill already exists", bill added/deleted toasts, and the GST Summary report table (which had disagreed with its own PDF export).
- Audit log summaries aligned to the same format across electricity and billing actions. Historical rows keep their original format - these strings are written at insert time.

### Import dialogs - UI fix

- Skipped-row and preview tables no longer show a stray full-width horizontal scrollbar. `TableCell` defaults to `whitespace-nowrap`, so long error text stretched the table; reason/error cells now wrap and the outer container scrolls vertically only. `Table` supplies its own `overflow-x-auto`, so genuinely narrow screens still scroll horizontally.

### Billing - void dialog

- "Reason for voiding" label marked required (`*` + `aria-required`) in both the single and bulk void dialogs. The field was already mandatory at the UI, Zod and audit layers, but nothing said so - users only discovered it from the greyed-out button.

### Payments - payment date (data-integrity fix)

- **Record Payment now takes a Payment Date**, defaulting to today and capped at today. `payments.paid_at` previously always fell back to `now()`, so a cash payment collected on the 30th but entered on the 3rd was stamped with the entry date. That value drives the receipt PDF's payment date, every report's date-range filter, and the unit account statement - so monthly collection figures moved with the data-entry lag. Hidden for Razorpay, which supplies its own timestamp. Back-dated entries are noted in the audit log.
- **Timezone-safe**: a back-dated entry is anchored at midday IST. `paid_at` is `timestamptz`, and IST midnight converts to 18:30 UTC on the *previous* day, which would drop the payment out of any report range filtered on that date.

### Payments - `record_payment` overload consolidation (bug fix)

`20260703000001` dropped the stale 5-arg `record_payment` overload because PostgREST returns HTTP 300 when two overloads are present. `20260723000001` then re-created that 5-arg version in order to add `advance_applied` to the outstanding check - but the application calls the 8-arg (Razorpay-aware) version, which never received that fix. Confirmed against the generated types, which showed `record_payment` as a union of two overloads.

- **Consequence**: for a bill covered by advance credit, outstanding was computed as `total - paid`, ignoring `advance_applied`. A further payment could therefore be recorded against an already-settled bill and overpay it.
- **Fix**: one 9-arg definition now carries both the `advance_applied` check and the Razorpay/service_role logic; both stale overloads are dropped. `p_paid_at` defaults to NULL, so callers passing the previous 8 arguments still resolve - no deploy-order coupling between the migration and the app.

| Migration | Change |
|-----------|--------|
| `20260908000001_record_payment_paid_at.sql` | Adds `p_paid_at` to `record_payment`; restores the `advance_applied` outstanding check on the path the app actually calls; drops the stale 5-arg and 8-arg overloads |

### Razorpay - advance credit over-charge (bug fix)

Surfaced while fixing the `advance_applied` check above. The self-service Razorpay path computed the amount to charge as `total_amount - paid_amount`, ignoring `advance_applied` - so an owner whose bill was already part-settled by cash-ledger advance credit was charged for the full amount.

Once `record_payment` began enforcing `advance_applied`, that over-payment would have been *rejected after Razorpay captured the money*, leaving a payment with no record and requiring a manual refund. All three paths now compute outstanding identically as `total - paid - advance_applied`:

- `create-order` - the amount charged to the payer
- `verify` - the amount recorded, and the >0 filter that decides which bills to record against
- `webhook` - the fallback path used when verify fails

### Error messages

- **Domain errors raised by our own Postgres functions now reach the operator verbatim.** "Amount exceeds the outstanding balance (₹900)" and "Payment date cannot be in the future" were previously classified as server faults and replaced with the generic "Something went wrong… contact support", hiding the one thing the operator could act on. An explicit allowlist passes through only messages we author; everything else is still sanitized.
- **Support ref codes are now generated in the billing timezone.** A UTC-based ref read `0908-1111` while the operator's screen showed 16:41 IST.

### Code quality

- Removed dead code in the Reports screen: the unused `headerSub` derived-header block (and its `formatAmount` helper, `collectionData`, `totalBilled`, `totalOutstanding`, `periodLabel`) and the unused `collectionView` prop binding in `reports-tabs`. `pnpm lint:fix` is now clean.
- `bills.generation.blocked` added to `ACTION_LABELS` so the audit log renders it in sentence case.



---

## v2.2 - Expense Tracker + AMC Reminder - 2026-08-20

### Expense Tracker (assoc_admin + billing_operator)

- **Expense log**: record completed payments with title, category, amount, GST amount, payor, payee / vendor, mode of payment (Cash, UPI, NEFT/RTGS/IMPS, Cheque, Demand Draft, Credit Card, Debit Card, NetBanking), reference number, invoice number, date of payment, notes, recurring flag, and attachment URL.
- **14 default system categories**: Maintenance & Repairs, Utilities, Security, Housekeeping, Landscaping, AMC Payments, Administrative, Legal & Professional, Insurance, Events & Community, Capital Expenditure, Salaries & Wages, Taxes & Govt Fees, Miscellaneous.
- **Vendor master**: vendor autocomplete via datalist on payee field.
- **List view**: date preset filters (This Month, Last Month, This Quarter, This FY, All Time), category filter, payment mode filter, full-text search. Checkbox selection for bulk delete. CSV export of filtered set.
- **Analytics tab**: KPI row (spend this month, spend this FY, entry count, top category); four Recharts charts - category donut, monthly trend bar, top-10 payees horizontal bar, payment mode donut. Data served by `/api/expenses/analytics` route.
- Soft-delete pattern (`deleted_at`) for audit trail.
- **Feature-gated**: only visible when super admin enables "Expense Tracker" flag for the association.

### AMC Reminder (assoc_admin only)

- **Contract management**: record AMC contracts with name, vendor details (contact person, phone, email), category (20 system categories covering all common building services), start/end date, contract value, payment frequency (Annual/Bi-annual/Quarterly/Monthly), notice period, auto-renewal flag, priority (critical/high/medium/low), coverage scope, SLA terms, and document URL.
- **Computed status**: active (>90d), due_soon (≤90d), urgent (≤30d), critical (≤7d), expired (<0d), terminated - computed at application layer from expiry date.
- **Dashboard tab**: 4 KPI tiles (Active, Due Soon, Urgent+Critical, Total Annual Cost ₹). "Needs Attention" panel lists urgent/critical/expired contracts with days-remaining and status badge. Category spend donut chart.
- **All Contracts tab**: colour-coded rows by urgency (left border stripe), sortable by expiry or contract value, filterable by status and category, free-text search by contract name or vendor.
- **Contract detail page** (`/amc/[contractId]`): all fields displayed. "Mark as Renewed" CTA → modal (new end date, value, notes) records renewal in `amc_renewal_history` and updates the contract. "Terminate" CTA → modal captures reason and soft-terminates via `terminated_at`.
- **Renewal history timeline**: chronological list of past renewals with dates and amounts.
- **Reminder Settings tab**: simple dropdown - "Remind X days before expiry" (90/60/30/15/7, default 30). Setting stored per association in `amc_reminder_settings`.
- **Daily email reminders** (Supabase cron): `send_amc_reminders()` DB function runs daily, strictly scoped by association - no cross-association data leak. Sends to all `assoc_admin` members of that specific association only.
- **Feature-gated**: only visible when super admin enables "AMC Reminder" flag for the association.

### Feature Flag Infrastructure

- New `association_feature_flags(association_id, feature, enabled, enabled_at, enabled_by)` table - clean per-feature toggles without schema changes for each feature.
- Super admin association detail page: "Features" section with toggle switches for Expense Tracker and AMC Reminder.
- Layout reads flags and passes to sidebar - nav entries only appear when the feature is enabled for that association.

### Navigation

- Two new sidebar entries under Operations: "Expense Tracker" (Receipt icon) and "AMC Reminder" (CalendarClock icon).
- Role visibility: `assoc_admin` sees both; `billing_operator` sees Expense Tracker only; `prop_owner`/`tenant` see neither.

### Polish & Fixes (2026-08-22)

- **Expense PDF logo**: association logo now fetched and embedded correctly via `sanitizeLogoUrl`; was hardcoded null.
- **Expense PDF UX**: immediate toast + spinner shown on export button while PDF renders.
- **Analytics - monthly trend**: all 12 FY months now pre-seeded with zero so the bar chart always shows a full year, not just months with data.
- **Analytics - X-axis**: removed ambiguous year suffix ("Aug 26" → "Aug") on the monthly trend chart.
- **Analytics - Top Payees tooltip**: tooltip now labels the value "Amount" instead of the raw dataKey name.
- **AMC dialog - category dropdown**: `SelectTrigger` gets `w-full` so options are never truncated.
- **AMC dialog - SelectValue SSR**: explicit children prevent hydration mismatch on all Select fields.
- **AMC dialog - notice period**: spinner arrows hidden so "days" suffix doesn't overlap native controls.
- **AMC dialog - phone field**: alphabets stripped on input; `inputMode="tel"` set.
- **AMC dialog - label copy**: "Email Address(Optional)" → "Email Address (optional)".
- **AMC dialog - footer**: replaced `DialogFooter` (causes `bg-muted` two-tone split) with a plain flex div.
- **AMC dashboard**: "Active" KPI tile renamed "On Track"; duplicate page title removed.
- **Code quality**: removed unnecessary `(client as any)` casts for typed `expenses` table in analytics route; added missing `'page'` type arg to `revalidatePath` in expense-actions.

### Reports Screen - Major Expansion (2026-08-28)

- **12-tab reports screen**: redesigned with three tab groups - Financial (Collection, Outstanding, Payments, Cash Ledger, Unit Dues, Unit Account Statement, Other Charges, GST Summary), Analytics (Electricity, Payment Modes, Advances), Property (Occupancy, Directory).
- **Other Charges report**: dedicated tab and PDF showing charge-type summary (billed, collected, outstanding) plus per-charge unit breakdown; pro-rata allocation from settled bill amount.
- **Tab-aware filter reset**: switching tabs now clears filters that the new tab does not support (bill types, status, payment mode, unit selection) - no stale filters carried across.
- **GST Summary moved to Financial**: grouped with other financial reports; removed from Analytics tab.
- **Analytics tab renamed**: "Utilities & Analytics" → "Analytics" (cleaner label).
- **Outstanding PDF fix**: Bill No. and Type columns no longer run together; column flex widths corrected.
- **Other Charges TypeScript fixes**: `TOOLTIP_STYLE` spread corrected; formatter and labelFormatter types resolved; stale `'bill_type'` tab key removed from action layer.
- **Unit Outstanding summary**: new migration adds `get_unit_outstanding_summary` RPC for the Unit Dues tab.

| Migration | Change |
|-----------|--------|
| `20260820000001_expense_tracker_amc_reminder.sql` | `association_feature_flags`, `expense_categories`, `vendors`, `expenses`, `amc_contracts`, `amc_renewal_history`, `amc_reminder_settings` tables; `amc_contract_status()` function; `send_amc_reminders()` cron function; RLS policies; 14 default expense categories + 20 AMC categories seeded |
| `20260821000001_expenses_netbanking_constraint.sql` | Adds NetBanking to the `mode_of_payment` check constraint on `expenses` |
| `20260828000001_unit_outstanding_summary.sql` | Adds `get_unit_outstanding_summary` RPC for the Unit Dues report tab |

---

## v2.1 - User Consent Gate + Owner/Tenant Advance Payments - 2026-08-15

### User Consent Gate

- First-login consent gate displayed to all non-super-admin users covering data consent, communications, payments, disclosure, rights, and governing law (matching the Ooruda User Consent document).
- Scroll-to-bottom requirement: "I Agree" button locked with a progress bar and lock icon until the user scrolls to the end of the document. Unlocked state shows a centred, full-width button.
- Consent stored as `consent_accepted_at timestamptz` in `profiles` - timestamp provides legal record of when consent was given.
- Super-admin users are naturally exempt (redirected to `/admin`).
- **Admin accounts table**: new "Consent" column on the Users tab - shows a green "Accepted" badge with a hover tooltip displaying the exact IST timestamp, or an amber "Pending" badge for users who have not yet consented.

### Advance Payment (Owner / Tenant Self-Service)

- **Owners and tenants can now make advance deposits online via Razorpay** for all four charge types: Maintenance, Electricity, Water, Other Charges (₹1 minimum, no upper limit).
- New **"Advance credits" section** in the Payments page: shows existing credit balance per charge type and an "Add Advance" button (disabled when gateway inactive).
- **Pay Advance dialog**: select unit (for multi-unit accounts), charge type, enter amount, checkout via Razorpay. After successful payment, a receipt download link appears immediately.
- **Advance deposit receipt PDF** (`/api/billing/advance-payments/[id]/pdf`): format matches existing due payment receipts; includes Razorpay payment ID and a note explaining the credit will auto-apply to future bills.
- **Idempotency**: unique index on `cash_ledger.razorpay_payment_id` prevents double-recording from concurrent `/verify` + webhook; 23505 error handled gracefully.
- **Webhook safety net**: `payment.captured` webhook now handles `notes.type === 'advance'` so payments are recorded even if the browser closes before `/verify` completes.
- **Cash ledger admin view**: advance entries now show `Online · Owner` / `Online · Tenant` (Razorpay-paid) vs `Manual · Admin` (admin-entered) in the Source column.
- **Recent payments**: advance deposits appear in the owner/tenant "Recent payments" list alongside bill and due payments, with receipt download.
- Auto-apply: `_apply_advance_internal` is called immediately after recording, settling any outstanding bills of that charge type.
- Advance credits shown in the PDF receipt document under new `advance_deposit` type.

| Migration | Change |
|---|---|
| `20260813000001_user_consent` | Adds `consent_accepted_at timestamptz` to `profiles` |
| `20260815000001_advance_payment_razorpay` | Adds `razorpay_order_id`, `razorpay_payment_id`, `paid_by_role`, `tenancy_id` to `cash_ledger`; unique partial index; `record_advance_payment()` function |

---

## v1.4.6 - Dashboard Accuracy, Admin Audit Log, PDF Fixes - 2026-08-12

### Dashboard - Advance Payment Accounting Fix

- **Outstanding, Collected, Overdue tiles** were ignoring `advance_applied` (advance ledger amounts settled against a bill). Bills fully paid via advance were incorrectly counted as Overdue, inflating the overdue count and outstanding total.
- `collected = paid_amount + advance_applied`; `outstanding = max(0, total - paid - advance)` per bill. Ageing buckets and overdue amount use the same formula.
- Result: arithmetic consistency restored - Billed − Collected = Outstanding holds exactly.
- **Overdue sublabel** changed from `"N units"` (wrong - it counted bills, not units) to `"N bills"`.
- **Collected tile link** fixed from `status=collected` (dead filter - `displayBillStatus` never returns "Collected") to `status=paid`.

### Admin Activity Log

- **Association dropdown** no longer shows demo/seed associations (e.g. "Makerkit"). Only associations with at least one audit log entry appear. Full-table scan capped at 2,000 rows to prevent unbounded query on large tables.
- **Table overflow fix**: activity table now scrolls horizontally on narrow screens (`min-w-[800px]`) with explicit column widths; Event path text truncates at 176 px.
- **Select styling**: native `<select>` border normalised with `appearance-none` + custom `ChevronDown` icon overlay - eliminates OS-default thick black border.
- **Super-admin audit log coverage**: `impersonateUserAction` now writes an audit entry (was the only high-risk action with no log). `logAdminAudit` catch block now logs a `warn` instead of discarding errors silently.
- **CSV export** (`/api/admin/activity/export`): new route exports up to 10,000 rows as CSV with IST timestamps, resolved actor/association names, and formula-injection protection.

### PDF Report Fixes

- **Bill No. / Type column concatenation**: adjacent left-aligned cells had no right padding, causing text from one column to visually bleed into the next (e.g. "SRT/26-27/MNT/000015Maintenance"). Fixed with `paddingRight: 6` on `cell` and `theadCell` styles.
- **Amount / Mode column concatenation**: same issue on right-aligned amount cells. Fixed with `paddingRight: 8` on `cellRight` and `theadCellRight`.
- **₹0 outstanding bills in Outstanding Dues**: bills fully settled by advance showed as outstanding in the PDF. Fixed with `filter(b => outstandingAmount(b) > 0)` before mapping `topBills`.
- **Payments section stranded header**: page-break could leave the "Payments Received" heading alone at the bottom of a page. Fixed with `minPresenceAhead={60}` on all four section title elements.
- **Payment mode KPI tiles**: capped at 5 modes (was unbounded after removing the `slice(0, 3)` cap) to prevent unreadably narrow tiles on A4 with many payment modes.

### CSV Export - Security

- Both CSV helpers (`reports-actions.ts`, `activity/export`) now prefix formula-injection characters (`=`, `+`, `-`, `@`) with a single quote so spreadsheet applications (Excel, LibreOffice) do not evaluate user-supplied data as formulas.

| Migration | Change |
|---|---|
| _(none)_ | No schema changes; all fixes are application-layer |

---

## v1.4.5 - Mobile UX Polish, Report Charts, Import Month Fix - 2026-08-11

### Import Meter Readings - Current Month Included

- The period selector in **Import Meter Readings** was excluding the current month, showing only past months. Fixed to include the current month so readings can be imported as soon as the billing cycle starts.

### Reports - Chart & UX Fixes

- **Payments tab**: timeline chart now sorts oldest→newest; payment mode donut shows mode name in tooltip; tooltip overflow fixed with `allowEscapeViewBox`; legend amounts rounded to whole rupees.
- **Electricity tab**: period selector shows human-readable month name (was raw `YYYY-MM`); unit-wise bar chart tooltip escapes viewport.
- **Outstanding tab**: Overdue by Age chart uses dynamic height + barSize cap so bars don't fill the container when few buckets exist; Oldest Unpaid date formatted as readable "5 Aug 2026"; added subtitle for context.
- **Reports tabs**: horizontal tab bar gets a right-fade mask to signal scrollability; Export button constrained to auto-width on mobile.

### Billing - Mobile UX

- **Bill detail panel**: due date formatted as "5 Aug 2026" (was DD-MM-YYYY); Download Bill button stacks below date on narrow screens; Total row gets a top border separator.
- **Unit billing page**: singular/plural fix - "1 Overdue Bills" → "1 Overdue Bill".

### Auth - OTP Screen

- Phone number masked on the OTP confirmation screen (`98xxxxxx06` instead of full number) for privacy.
- Increased vertical gap around OTP input for better breathing room.

| Migration | Change |
|---|---|
| _(none)_ | UI-only fixes; no schema changes |

---

## v1.4.4 - PDF Logo Fix, Razorpay Reference on Receipts, Historical Tenancy Snapshot - 2026-08-10

### PDF Logo - Transparent Background Fix

- PNG logos with an alpha channel were rendering with a **black background** on receipts and bills because JPEG has no alpha support and sharp filled dropped pixels with opaque black by default.
- Fix: `preprocessLogoForPdf` now reads image metadata via `sharp.metadata()` and conditionally applies `.flatten({ background: '#ffffff' })` before JPEG encoding - only when `hasAlpha` is true. Non-transparent images are unaffected; the in-memory logo cache is preserved.

### Razorpay Payment ID on Receipts

- `razorpay_payment_id` (`pay_*`) is now surfaced as the **Reference No.** on payment receipts when `mode = 'Razorpay'` and no manual reference number was entered. Previously this field was stored in the DB but never reached the PDF template.
- Applied to bill payment receipts (`pdf-generation.ts`) and cash ledger due payment receipts (both PDF routes).

### Historical Tenancy Snapshot on Cash Ledger Payments

- Cash ledger due payment receipts previously resolved the tenant with a live `WHERE status = 'active'` query, which breaks after tenant turnover on a unit (wrong tenant name on historical receipts).
- New migration adds `tenancy_id uuid` to `cash_ledger_payments` and the `record_due_payment` RPC now snapshots the active tenancy at payment time (mirrors how `bills.tenancy_id` works). PDF routes use the stored `tenancy_id` instead of a live lookup.

### UI Polish

- **Admin overview panel**: removed "Pending actions" card (overdue alert + mescom reminder); cleaned up unused imports.
- **Audit log**: removed EventType tab bar; renamed heading from "Activity Log" → "Audit Log".
- **Bill detail panel**: "Download PDF" label → "Download Bill".
- **Auth layout**: increased padding (`py-8 sm:px-10 sm:py-10`) for better breathing room.
- **Import dialogs**: cash ledger import dialog responsive margin fix (`mx-4 sm:mx-auto`); meter readings help text whitespace fix (missing space before "Leave blank").
- **Electricity report tooltip**: `allowEscapeViewBox` + fixed `x` position to prevent clipping on narrow viewports.

| Migration | Change |
|---|---|
| `20260809000002_receipt_paid_by_role` | Adds `paid_by_role` to `cash_ledger_payments`; updates `record_due_payment` RPC |
| `20260810000001_cash_ledger_payment_tenancy_id` | Adds `tenancy_id` to `cash_ledger_payments`; updates `record_due_payment` RPC to snapshot active tenancy |

---

## v1.4.3 - Payments: Bulk Receipt Download, Advance Payment Receipts, PDF Speed - 2026-08-10

### Bulk Receipt Download

- **"Download Receipts (N)" button** added to the Payments page (admin/operator only), mirroring the bulk bill ZIP download. Respects all active filters. Includes both cash/card payment receipts and advance credit vouchers.
- **`apps/web/app/api/billing/payments/export/zip/route.ts`** (new): POST endpoint accepting `paymentIds` (bill payment receipts) and `advanceVoucherNos` (advance vouchers) - scoped to the caller's association via `association_id` filter to prevent cross-association data access.
- **`apps/web/app/api/billing/payments/export/zip/bulk-render.ts`** (new): `fetchBulkReceiptData` batches all payment + join queries; `renderReceiptFromPrefetch` renders each receipt with zero extra DB calls.
- **ExportMenu removed** from Payments page.

### Advance Payment Receipts

- Bills fully or partially paid via advance credit now show an **"Advance Applied"** entry in the payments dialog alongside cash payments, with a downloadable Advance Credit Voucher PDF.
- `BILL_WITH_PAYMENTS_SELECT` extended to join `advance_application_receipts` per bill.
- `PaymentRow` extended with `is_advance` flag; PDF URL routes accordingly (`/api/billing/advance-applications/[voucherNo]/pdf` vs `/api/billing/receipts/[id]/pdf`).
- **Advance Credit Voucher description** updated from "Advance credit - {type}" to "Advance applied - {type}" for clarity.

### PDF Generation Speed

- **Logo in-memory cache** (`logoCache` Map in `pdf-generation.ts`): logo download + sharp resize runs once per process lifetime per association. Eliminates repeated Storage downloads on every PDF request.
- **Receipt fast-path**: `getOrGenerateReceiptPdf` now does a lightweight `receipts(receipt_no, pdf_url)` query first; if a cached PDF exists, returns a signed URL immediately without executing the full association/unit/accounts join. Matches the pattern that made bill PDFs fast.
- **Logo style fix** (`cash-ledger-payments` routes): both cash ledger PDF routes were passing the raw Storage URL instead of a preprocessed JPEG data URI - react-pdf cannot fetch Supabase Storage URLs directly. Both now call `preprocessLogoForPdf`.

### Bug Fixes

- **Bulk receipt payer name**: `resolveReceivedFrom` was using `bill_to` preference to pick the payer when `paid_by_role = 'Owner'`, returning the tenant's name instead of the owner's. Fixed to match `resolvePayerEntity` (owner is always the fallback when not paid by Tenant).
- **Bulk receipt period**: Period was derived from `paid_at` timestamp (payment month) instead of `bill_period` (billing month). A payment in August for a July bill now correctly prints July on the receipt.
- **`paymentContext` removed** from bulk receipt render path - this field is for cash ledger dues receipts only; passing it on bill payment receipts produced spurious text in the PDF.

| Migration | Change |
|---|---|
| - | No migrations |

---

## v1.4.2 - Bulk Bill Download Optimisation & Billing UX Cleanup - 2026-08-10

### Bulk ZIP Download - Batch Query Optimisation

The ZIP download was making ~6 DB queries per bill (N×6 queries for N bills), causing 10s+ response times for 30+ bills.

- **`apps/web/app/api/billing/bills/export/zip/bulk-render.ts`** (new): `fetchBulkBillData` replaces per-bill queries with 6 fixed `IN(...)` batch queries for all bills at once, building lookup Maps for O(1) per-bill access. `renderBillFromPrefetch` renders each PDF from those Maps with zero DB calls. Result: 55 bills in ~4.6s.
- **`route.ts`** rewritten: `withConcurrency` limiter (render: 12, download: 30) prevents socket exhaustion. Cached PDF downloads are throttled instead of unbounded `Promise.all`. Cache-miss fallbacks collected cleanly and merged into the render queue.
- All 6 Supabase batch queries have explicit error checking - failures throw a 500 instead of producing silently corrupt PDFs.
- `bill_to` field respected in bulk render: units with `bill_to = 'owner'` always bill the owner even when a tenancy exists.
- `renderBillPdfBuffer` removed from `pdf-generation.ts` (superseded by `renderBillFromPrefetch`).

### Billing UI Cleanup

- **Single "Download Bills (N)" button**: replaces the previous dual-button layout (ExportMenu + separate ZIP button). Shows a count reflecting the current selection (or all visible bills when nothing is selected).
- **ExportMenu ZIP option removed**: ZIP was the only billing export; the dropdown is now reserved for future Reports use. `export-menu.tsx` and `export-csv.ts` preserved as-is - documented in `TECH_DEBT.md` for potential Reports reuse.
- **Checkbox visual bug fixed** (`unit-row.tsx`): `e.preventDefault()` on the parent div suppressed the browser's native checkbox toggle, causing checked state to not render visually even though React state updated correctly. Fixed by moving `e.stopPropagation()` directly onto the checkbox's `onClick` and removing `preventDefault`.
- **Overdue filter fixed** (`unit-billing-table.tsx`): export filter used client-side `due_date < today` (diverges from DB-stamped overdue status; also has IST UTC-midnight shift bug). Replaced with `b.status === 'Overdue'`.

### PDF Logo Fix

- **`packages/pdf-templates/src/components/styles.ts`**: Removed `height: 104` and `objectFit: 'contain'` from the logo style - react-pdf ignores `objectFit`, causing the fixed height to crop non-square logos. Now uses `width: 80` only; react-pdf scales proportionally from the image's natural dimensions.

| Migration | Change |
|---|---|
| - | No migrations |

---

## v1.4.1 - Electricity Billing Period Alignment - 2026-08-09

### Electricity Billing: Period Alignment with Other Bill Types

**Breaking change in billing workflow semantics** (data migrated automatically).

Previously, electricity data was stored under the *reading month*: a July collection bill had `period = 2026-06` and `due_date = 2026-07-10`, forcing the billing operator to run two separate "Generate bills" passes to assemble a full month's collection. All other bill types use the billing month as `period`.

From this release, electricity bills share the same period semantics as maintenance, other charges, and sinking fund:

- **Billing month** = the month payment is collected = `bills.period` / `mescom_bills.period`
- **Reading dates** = captured in `mescom_bills.period_start` / `period_end` (unchanged source of truth for the PDF)
- One "Generate bills for July" run now produces all bill types due in July

**Changes:**

- **`billing-actions.ts`**: Removed the `elecPeriod` next-month offset. Electricity `due_date` now uses the same `calculateDueDate(period, electricity_due_day)` as all other types.
- **MESCOM bill upload form**: Default period is now the current month (was previous month). Period dropdown includes current month. Field labels updated: "Billing Month" (not "Billing Period"), "Reading from" / "Reading to" (not "Period start/end"). `period_start`/`period_end` now auto-populate to the previous month's date range (the reading month).
- **Electricity bill PDF**: Line item description changed from *"Electricity Charges for June 2026"* to *"Electricity Charges - Jun 2026 Readings"* (reading month, not billing month). Metadata label changed from *"Billing Period"* to *"Reading Period"*. `period_start`/`period_end` display logic unchanged; falls back to `bill.period - 1 month` when not set.
- **Migration `20260809000001_electricity_billing_period_alignment.sql`**: Shifts `mescom_bills.period`, `meter_readings.period`, and `bills.period` (electricity only) forward by one month. Backfills `period_start`/`period_end` on any MESCOM bills missing them. Includes a safety guard that aborts if the shift would cause a unique-constraint collision (e.g., consecutive-month test data).

**Prod note**: One month of electricity data in production - collision guard will pass. Run `./scripts/db-push.sh --production` as usual.

| Migration | Change |
|---|---|
| `20260809000001_electricity_billing_period_alignment.sql` | Period +1 month shift for electricity data; period_start/period_end backfill |

---

## v1.4 - Notifications, Reminders, Activity Tracking & Security Hardening - 2026-08-06

### Transactional SMS Notifications
- **`@kit/sms` extended** - `sendSms(phone, templateKey, variables)` added to all providers: Kaleyra (DLT `template_id` + `template_data`), MSG91 (flow API), 2Factor (TRANS_SMS), and Mock (console).
- **4 DLT template keys** registered: `bill_generated`, `payment_confirmed`, `reminder`, `overdue`. Each maps to a separate env var for the DLT-registered template ID.
- **Kaleyra**: uses `type=TXN`, sends `template_id` + `template_data` (never `body` alongside `template_id`).

### Automated Email Alerts
- **`apps/web/lib/notify.ts`** - unified notification dispatcher for SMS + Email + In-app. Reads channel enablement from DB with 5-minute in-process cache. Uses `after()` from `next/server` so notifications never block the user-facing response.
- **`packages/email-templates`** - new `BillReminderEmailProps` email template (`bill-reminder.email.tsx`) with amber (reminder) and red (overdue) variants, outstanding-amount highlight box, and CTA button.
- **Email sender**: `hello@ooruda.com` via Resend.
- **Triggers wired**: bill generation → `sendBillGeneratedNotifications()` (per unit: owner + active tenant); payment recorded → `sendPaymentConfirmedNotification()`.

### Reminder Scheduling (pg_cron + Edge Function)
- **Migration `20260806000002_reminder_cron.sql`**: enables `pg_cron` + `pg_net`; schedules `overdue-recompute` (1 AM IST daily) and `send-reminders` (9 AM IST daily).
- **Edge Function `send-reminders`**: reads `billing_settings.reminder_schedule_json` per association, queries matching Unpaid/Partial/Overdue bills, sends SMS + email + in-app notification per recipient.
- **`recompute_overdue_bills()`** PL/pgSQL function stamps Overdue status in DB (source of truth for all overdue display).

### Enhanced Activity Tracking
- **Migration `20260806000001_activity_tracking_and_notifications.sql`**: extends `audit_logs` with `event_type`, `http_method`, `path`, `status_code`, `duration_ms`, `error_code`, `metadata`, `ip_address`, `user_agent`; makes `association_id` nullable for platform-level events.
- **`lib/audit-log.ts`** rewritten - `AuditEventType` union, all new fields, auto-resolves actor from session, uses admin client for system/auth events.
- **Auth hook** (`supabase/functions/auth-events-hook`): Deno Edge Function with HMAC-SHA256 signature verification; maps auth events to `audit_logs` with masked email.
- **Activity Log UI** (`/[account]/audit`): event type filter tabs (All / User Actions / Auth Events / Errors / System), status badge (HTTP code or event type), API path sub-row, error code display.
- **Super-admin Activity page** (`/admin/activity`): platform-wide view across all associations, no `association_id` filter, Association column added.

### In-App Notifications Bell
- Uses Makerkit's existing `notifications` table (`NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true`).
- `notify.ts` writes `**title**\nbody` format to `notifications.body`; `MyAlertsCard` parses it for bold title + body.
- **Notifications page** (`/[account]/notifications`): two-tab layout - "My Alerts" (per-user in-app alerts with dismiss/mark-all-read) + "Sent Log" (outbound notifications history with delivery metrics).
- `notifications_log` table tracks all outbound deliveries with status (Sent/Failed/Delivered).

### Notification Channel Management
- **`notification_providers_config`** table: platform-default rows for SMS and Email (both disabled by default); super-admin can toggle per-channel.
- **Admin → Communication Channels** (`/admin/channels`): toggle switches for SMS/Email/WhatsApp with real-time badge update. Permanent redirect from old `/admin/notification-settings` URL.
- **Admin → Activity Log** (`/admin/activity`): linked from admin sidebar.
- **Channel gate covers all email paths**: bill generation, payment receipt, bill reminders (both `notify.ts` and `send-reminders` Edge Function check `notification_providers_config` before sending).

### Audit Log (assoc-admin)
- Renamed from "Activity Log" back to "Audit Log" in nav, page title, and metadata.
- Errors tab removed from assoc-admin view - only super-admin sees error events.

### Security Hardening
- **In-memory rate limiter** in `proxy.ts`: 5 req/60 s on `/auth/*`, 30 req/10 s on `/api/*`; 429 response with `Retry-After` header. Removed misleading `X-RateLimit-Limit: 0` header. No Redis dependency.
- **Auth event hook hard-rejects** if `AUTH_HOOK_SECRET` is not configured (was silently accepting unauthenticated requests).
- **Razorpay webhook**: both signature checks use `crypto.timingSafeEqual` (prevents timing-based HMAC oracle attacks).
- **Auth event logging**: all sign-in, sign-up, MFA, token-refresh events tracked in `audit_logs` via Edge Function webhook.

### Bug Fixes & Code Quality
- `activeTenanUserId` typo fixed in `notify.ts` interface and `billing-actions.ts` call site → `activeTenantUserId`.
- `send-reminders` Edge Function: notification links and email CTA now use the real association slug (`/home/<slug>/billing`) instead of dead `/home/-/billing`.
- `packages/email-templates`: `BillReminderEmailProps` now accepts `accountSlug`; CTA href corrected.
- `notify.ts` `getEmailAddresses()`: sequential `for` loop replaced with `Promise.all` (eliminates N+1 auth admin API calls).
- `packages/next/src/routes/index.ts`: useless try/catch wrapper removed (oxlint `no-useless-catch`).
- Migration `20260806000001`: `CREATE POLICY` statements now idempotent (guarded with `DROP POLICY IF EXISTS`).

### send-reminders Edge Function - Fixes (2026-08-07)
- **Associations query fixed**: `select('id, name, ...')` → `accounts!inner(name, slug)` - `name` column does not exist on `associations`; name lives on the linked `accounts` row.
- **Status filter fixed**: `.eq('is_active', true)` → `.in('status', ['Active'])` - `is_active` column does not exist; correct column is `status` with value `'Active'`.
- **Test mode**: allows `status = 'Setup'` associations when `test_association_id` is passed, so demo/staging associations can be tested without being fully activated.
- **Tenancies relation normalised**: Supabase returns the embedded `tenancies` relation as a single object (not an array) when there is exactly one row. Added `Array.isArray` normalisation guard to prevent `TypeError: .find is not a function`.
- **Deno `.catch()` incompatibility fixed**: all 5 `supabase.from(...).insert(...).catch(() => null)` patterns replaced with `try { await } catch {}` - Deno's Supabase client does not expose `.catch()` on insert promises.
- **₹0 outstanding guard**: bills with `outstanding === 0` (fully settled but not yet stamped `Paid`) are now skipped - previously sent spurious reminders.
- **Overdue detection in test mode**: `targetEntry` is never found when using `test_unit_id` (due-date filter is skipped), so `isOverdue` fell back to `false` for all bills. Now falls back to `new Date(bill.due_date) < today` date comparison.
- **Email formatting**: raw `bill_type` (`other_charges`, `electricity`), `period` (`2026-07`), and `due_date` (`2026-07-10`) are now formatted as human-readable strings (`Other Charges`, `July 2026`, `10th July 2026`) in both the email body and in-app notification copy.
- **Amount formatting**: standardised to `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` throughout (was mixing `toLocaleString` and `Intl.NumberFormat`).
- **Subject line redesign**:
  - Overdue: `Overdue Bill: Immediate Action Required` (no bill type, no date, no association name)
  - Other Charges reminder: `Payment Reminder: Bill Due on 10th July 2026` (type omitted - "Other Charges" is confusing to residents)
  - Maintenance / Electricity reminder: `Payment Reminder: Maintenance Bill Due on 10th June 2026`
- **Date format**: all dates now use ordinal day + full month name (`10th July 2026`) instead of ISO strings.
- **Bill Type row added** to email details table so recipients can identify the bill type within the email body even when the subject omits it.

### Migrations in This Release

| File | Description |
|------|-------------|
| `20260806000001_activity_tracking_and_notifications.sql` | Extends `audit_logs`; adds write RLS policies + seed rows for `notification_providers_config` |
| `20260806000002_reminder_cron.sql` | pg_cron + pg_net, overdue-recompute + send-reminders schedules |

### Deployment Steps Required
1. Push migrations: `./scripts/db-push.sh`
2. Deploy Edge Functions: `supabase functions deploy send-reminders` and `supabase functions deploy auth-events-hook`
3. Set DB config vars: `app.supabase_project_url` and `app.supabase_service_key` (for cron → Edge Function call)
4. Register `auth-events-hook` in Supabase Dashboard → Authentication → Hooks
5. Set env vars: `KALEYRA_SMS_TEMPLATE_BILL_GENERATED`, `KALEYRA_SMS_TEMPLATE_PAYMENT_CONFIRMED`, `KALEYRA_SMS_TEMPLATE_REMINDER`, `KALEYRA_SMS_TEMPLATE_OVERDUE`, `RESEND_API_KEY`

---

## v1.4 - Comprehensive performance audit & optimisation - 2026-08-05

Full end-to-end audit of 72 confirmed bottlenecks across DB queries, API routes, server-side data fetching, and client-side rendering. All high-impact items resolved.

### Database (migration `20260805000002_missing_fk_indexes.sql`)
- **8 missing FK indexes** added with `CREATE INDEX CONCURRENTLY` - highest-impact: `payments(association_id)` was causing 2-3 s full-table scans on Payments/Billing pages.
- **GIN trigram indexes** on `profiles.full_name` and `audit_logs.action` for sub-millisecond `ILIKE '%…%'` search.
- **New `get_unit_ledger_balances()` RPC** - replaces full-table `cash_ledger` fetch + client-side JS reduce with a single DB-side `SUM … GROUP BY`, eliminating thousands of extra rows sent over the wire.

### API routes - serial round-trip elimination
- **Cash ledger aggregation** (`lib/cash-ledger-aggregation.ts`) - switched to new RPC; eliminates full table scan and JS aggregation.
- **Bill dispatch** (`admin/bill-dispatch/_lib/dispatch-queries.ts`) - 4-serial-hop bills→payments→receipts→tenancies→profiles collapsed to 2 parallel queries.
- **Billing units page** - `profiles` join added to units SELECT, eliminating a 5th serial round-trip.
- **Unit detail page** - same profile join fix; removes a conditional sequential `profiles` fetch.
- **PDF generation** (`billing/_lib/server/pdf-generation.ts`) - removed duplicate `canAccessUnit()` inside `generate()` closure (was called twice per cache miss); added profiles join to tenancy query.
- **Razorpay `verify-due` and `create-order-due` routes** - gateway fetch added to the existing `Promise.all`, removing a sequential hop after auth checks.
- **Statement PDF route** - collapsed `accounts → associations` two-hop serial into a single join query (`accounts!inner`).

### API routes - auth & caching fixes
- **`cash-ledger-payments/[id]/pdf` and `by-receipt`** - removed redundant `auth.getUser()` calls (already injected by `enhanceRouteHandler`); replaced `console.error` with structured `logger.error`.
- **`Cache-Control: private, no-store`** added to all on-demand PDF responses (bills export, payments export, cash-ledger PDFs) so Next.js Edge Cache never stores user-specific documents.

### Server-side page data fetching
- **Members page** - `is_super_admin()` RPC now runs in `Promise.all` alongside `loadMembersPageData()`.
- **Reports actions** - eliminated duplicate `profiles` fetch in `downloadPdfAction` (was already fetched by `resolveAssociation()`).
- **Electricity page** - O(bills × readings) nested loop replaced with O(bills + readings) pre-index + backwards scan per bill.

### Client-side rendering
- **Statement table** - 6 separate `rows.reduce/some` passes replaced with single `useMemo` pass, saving 5 redundant array traversals on every filter change.
- **Unit billing table counts** - 3 separate `tree.filter` calls merged into one pass per filter change.
- **Unit billing table metrics** - 3 separate `filtered.reduce/filter` calls merged into one pass.
- **`UnitRow`** wrapped in `React.memo` - prevents all 25+ unit rows from re-rendering on every filter keystroke.
- **Electricity page** `meter_readings` query bounded to one period before the oldest visible MESCOM bill - eliminates loading all-time readings history on every page load.
- **Reports payments tab** `bill_type` filter now applied to Razorpay payments at DB level (was only applied to cash-ledger payments; Razorpay rows were returned unfiltered then discarded client-side).
- **`/billing/` root `loading.tsx`** added - Next.js now shows the global loader skeleton during server-render of the billing overview instead of a blank page flash.
- **ZIP export N+1 eliminated** (`api/billing/bills/export/zip`) - `pdf_url` added to initial SELECT; all cached PDFs are now batch-signed in one `createSignedUrls` Storage API call and fetched fully in parallel. Previously: N DB queries + N signed URL calls + N sequential HTTP fetches (batched 5). Now: 0 extra DB queries + 1 batch Storage call + all HTTP fetches in parallel. Saves 4–20 s on typical 10–25 unit exports.

---

## v1.4 - Kaleyra SMS/WhatsApp integration - 2026-08-05

### SMS provider replaced: MSG91/2Factor → Kaleyra
- **New provider `KaleyraProvider`** in `@kit/sms` - supports SMS OTP and WhatsApp OTP via Kaleyra's v1/v2 REST APIs.
- **Supabase Edge Function updated** - `custom-sms-hook` now dispatches OTP via Kaleyra when `SMS_PROVIDER=kaleyra`.
- **DLT template wired up** - sender ID `HABSOL`, template ID `1077123750020216799` ("Ooruda OTP template Habbaa"), region `IN`.
- **WhatsApp channel ready** - switchable via `KALEYRA_CHANNEL=whatsapp` with per-template copy-code button support (`KALEYRA_WA_HAS_COPY_BUTTON`).
- **Kaleyra email API documented** as backup to Resend (no mailer adapter change; Resend remains primary).
- Legacy MSG91 and 2Factor providers retained as fallback options.

---

## v1.4 - Admin Accounts page overhaul + test-phone auto-tagging - 2026-08-05

### Admin accounts page - full UI/UX redesign
- **Removed "All" tab** - replaced with two concrete tabs: Associations and Users, each showing only relevant columns.
- **Tab counts** - tabs now show record totals: "Associations (3)" / "Users (63)".
- **Tab-contextual columns** - Associations tab: Name, Created, Actions. Users tab: Name, Phone, Email, Roles, Created, Actions. The redundant Type column and low-value Updated At column are removed.
- **Role chips** - roles are now displayed as readable `bg-muted` chips instead of comma-joined plain text. Multi-role users show one chip per role with flex-wrap.
- **Date-only timestamps** - Created column shows date only (e.g. "14 Jun 2026"); hovering shows the full date+time tooltip.
- **Tab-contextual Create buttons** - "Create Association" and "Create User" buttons appear inline in the filter row, contextual to the active tab. Abbreviated labels on mobile ("+ Assoc" / "+ User").
- **Instant client-side tab switching** - all data is fetched once on server load and filtered in-memory on the client. Tab switches and search are instantaneous with no server round-trip. (Previous approach used `router.push` + server prefetch; replaced with local state + client filter since the dataset is small.)
- **Debounced live search** - search triggers after 200ms of typing; a visible Search button also submits. Placeholder text adapts to the active tab.
- **Empty state** - friendly empty state with icon and message when no records match a query.
- **Name/Email truncation** - long names and emails truncate with `…` and show full value on hover.
- **Table responsive** - Users table sets min-width for horizontal scroll on mobile instead of compressing columns.
- **Test badge compact** - Test badge is a small `text-[10px]` inline pill that never breaks the name row layout.
- **Actions menu fixes** - "Delete Personal Account" → "Delete User"; "Send Reset Password link" → "Send Reset Password Link".

### Admin login redirect
- Super admin landing page (`/admin`) now redirects immediately to `/admin/accounts`. The Dashboard page had no usable content.
- Dashboard removed from the admin sidebar and mobile nav dropdown.

### Auto-tagging test users by phone prefix
- Users with a phone number starting with `+9199110000` or `+9199999999` are automatically tagged as test users (`profiles.is_test = true`).
- A database trigger (`trg_auto_tag_test_phone`) ensures all future users with these prefixes are auto-tagged on insert/update of phone number. Correcting a test phone to a real number un-tags the user.
- The accounts page also detects test phones in real-time as a fallback (for records created before the migration runs on remote).
- Backfill covers rows where `is_test IS NOT TRUE` (handles both `false` and `NULL`).

---

## v1.4 - Mobile nav fixes: Bill Dispatch in admin, hamburger always visible - 2026-08-05

### Admin mobile nav - Bill Dispatch missing
- Bill Dispatch was present in the desktop sidebar but omitted from the admin topbar's mobile dropdown. Added it (gated by the same `NEXT_PUBLIC_ENABLE_BILL_DISPATCH` env flag).

### Team account topbar - hamburger button collapsing on narrow screens
- The left flex container used `min-w-0`, allowing it to shrink to zero on narrow phones (360–375px) and hide the Menu/hamburger button behind the AssociationSwitcher. Fixed by making the left container `shrink-0` so the button is always guaranteed space.
- Page label hidden on mobile (`hidden lg:block`) - it wasn't visible at narrow widths anyway and was competing for space.
- AssociationSwitcher label capped at `max-w-[90px]` on phones (`max-w-[140px]` on sm+) so the name and hamburger coexist on 360px screens.

---

## v1.4 - UX fixes: Edit Unit dialog, billing banner, admin Cancel, sidebar icons - 2026-08-05

### Edit Unit dialog
- Added **Cancel** button next to Save details - dialog was previously only dismissible via the X icon.
- Dialog content is now scrollable (`overflow-y-auto`, `max-h-[90vh]`) so the full form is accessible on small screens.
- **Bill to** option labels shortened and clarified: "Auto (tenant if occupied, else owner)" → "Auto - tenant if occupied, else owner"; added "Always bill owner / Always bill tenant" for clarity.
- Added form description for the Bill to field: "Controls whose name appears on bills for this unit."

### Maintenance bills callout
- Removed duplicate icons - the callout was showing both a Wrench and an Info icon side by side. Now shows only the Wrench.
- Reworded body copy: "Click **Generate Bills** above to create maintenance bills for all active units. The bill amount is calculated based on each unit's area at generation time." - clearer action prompt.

### Admin Edit User - Cancel button
- Cancel button was a no-op when the dialog was opened from the account detail page (no `onOpenChange` prop passed). Dialog now tracks its own `internalOpen` state and supports both controlled and uncontrolled usage.

### Sidebar nav icons on mobile
- Nav icons defined with only `w-4` (no `h-4`) caused aspect-ratio mismatches on some mobile browsers where the SVG height defaulted to the lucide size attribute (24px) while width was clamped to 16px. Fixed: icon class is now `w-4 h-4 shrink-0` in both team and personal account navigation configs.

### Bill dispatch - sortable columns
- Unit, Owner, and Tenant columns in the dispatch table are now sortable. Click a column header to sort ascending; click again to flip to descending. An inactive sort indicator (⇅) is shown on unsorted columns. Locale-aware sort via `localeCompare('en-IN')`.

---

## v1.4 - Bill Dispatch: UX polish, correctness fixes & PDF auto-generation - 2026-08-05

### Sortable columns
- Unit, Owner, and Tenant columns in the dispatch table are now sortable. Click a column header to sort ascending; click again to flip to descending. An inactive sort indicator (⇅) is shown on unsorted columns. Locale-aware sort via `localeCompare('en-IN')`.

---

## v1.4 - Bill Dispatch: UX polish, correctness fixes & PDF auto-generation - 2026-08-05

### Owner / Tenant email toggle
- Each dispatch row now has an **Owner / Tenant** toggle so the operator can choose who receives the email. Defaults to Owner; switches to Tenant when only the tenant has an email on file.
- Added **Tenant Name** column. Removed Status column (payment status doesn't belong in a dispatch view).
- Toggle buttons have equal fixed widths (`58px` each). Unavailable side is greyed out with `cursor-not-allowed`.

### PDF auto-generation on send
- Bills or receipts with no cached PDF (`pdf_url = null`) no longer block dispatch. The server now calls `getOrGenerateBillPdf` / `getOrGenerateReceiptPdf` with `skipAuth: true` at send time, generating and attaching the PDF on-the-fly.
- "No PDF" warning replaced with a muted grey "Auto-generate on send" hint - not a blocker.
- Storage-miss retry: if the cached storage object was deleted after the snapshot, the server nulls `pdf_url` and regenerates rather than failing silently.
- Summary bar shows an informational chip ("N PDFs will be generated on send") rather than a warning.

### Receipts mode - advance credit bills
- Bills fully paid via advance credit (no `payments` row) now display a grey **"Advance credit"** label in receipts mode instead of an alarming "No receipt" warning. They are skipped cleanly with an info chip in the summary bar.

### Correctness fixes
- **Receipts mode was empty:** `.eq('status', 'paid')` matched zero rows - DB stores `'Paid'` (Title Case). Fixed.
- **Bill status filter:** replaced `.neq('status', 'Void')` blocklist with `.in('status', ['Unpaid', 'Partial', 'Paid', 'Overdue'])` allowlist.
- **`paymentIdByBill` / `receiptByBill` mismatch:** for bills with multiple partial payments, the two maps could point to different payment rows. Fixed by deriving `paymentIdByBill` from `receiptByBill` after adding `ORDER BY paid_at DESC`.
- **Receipt fallback storage path:** was queried by `receiptId`; now uses `payment_id` to match the PDF generation call.
- **Timezone off-by-one:** due dates rendered one day early when ISO strings are parsed as UTC midnight. Added `timeZone: 'Asia/Kolkata'` to both the dispatch client (`formatDueDate`) and the email template (`dueDateLabel`).
- **`recipientEmail` rename:** `SendBillEmailsInput.items` field was `ownerEmail`; renamed to `recipientEmail` to reflect that it may be the tenant's address.
- **`downloadFromStorage` type:** parameter changed from `client: any` to `client: SupabaseClient` with a proper import.
- **`emailTargets` state:** changed from `Map<string, EmailTarget>` (non-idiomatic in React) to `Record<string, EmailTarget>` with spread updates.
- **`skipAuth` added to `getOrGenerateReceiptPdf`:** mirrors existing bill pattern; outer pre-check and inner `canAccessUnit` call are both bypassed when `skipAuth: true`.

---

## v1.4 - Bill Dispatch Bug Fixes - 2026-08-05

### Email template - layout, dark mode & copy

- **Detail table rendered as stacked lines with large gaps.** The label/value rows used `<Row>` with `<Text>` children - react-email's `Row` renders a `<tr>`, so a `<Text>` (a `<p>`) inside it is invalid HTML and mail clients hoisted it out of the table, stacking label and value on separate lines. Rebuilt with `Row` + `Column` (proper `<td>` cells) and fixed 42/58 column widths so values align across all rows.
- **Dark mode:** added `color-scheme` / `supported-color-schemes` meta tags so Apple Mail, iOS Mail and Outlook no longer auto-invert the email. Gmail's Android app force-inverts regardless of these hints - the palette stays legible when it does, but full control is not possible there.
- **Bill type case:** subjects and headings showed the raw DB value ("Your maintenance Bill"). Now title-cased via `formatBillType()`, so `other_charges` renders as "Other Charges".
- **Copy:** removed the duplicated bill-type wording between heading and body, added the association name to the body, and made the preview text useful (amount + due date rather than a repeat of the subject).
- Spacing tightened throughout; body text raised to 15px/24px.

### Attachments

- **Missing attachment sent silently.** `fetchPdfAsBase64` returned `null` on failure and the email was sent anyway - delivering a bill that claims "attached to this email" with nothing attached. It now throws, and the item is reported as failed instead of being sent.
- **Invalid attachment filenames.** Bill numbers contain slashes (`DT/26-27/MNT/000006`), which are path separators; Gmail showed truncated names. Added `toSafeFilename()` → `Bill_DT-26-27-MNT-000006_2026-08.pdf`.
- **Receipts mode no longer falls back to the bill PDF.** Previously a paid bill with no receipt PDF would send a "Payment Receipt" email with the *invoice* attached. Receipts now require an actual receipt PDF.

### Bill Dispatch screen

- Rows with no PDF are now flagged ("No PDF" under the bill number), excluded from auto-selection, and counted in a warning chip - matching the existing "no email" treatment. Previously these rows looked sendable and failed silently at send time.
- Page heading aligned with the content below it (`PageHeader` lacks the `lg:px-4` that `PageBody` carries).

### Diagnostics

- Each failed dispatch now logs at `error` level with the unit, bill number and full stack. The audit log previously recorded only counts, so the cause of a failure was unrecoverable. The client still receives only the sanitized message.

---

## v1.4 - Bill Dispatch Tool + Security Hardening - 2026-08-04

### Feature: Bulk Bill & Receipt Email Dispatch (internal, non-prod only)

A temporary super-admin tool at `/admin/bill-dispatch` for manually sending generated bills and payment receipts to unit owners via email. Gated by `NEXT_PUBLIC_ENABLE_BILL_DISPATCH=true` - must not be set in production.

**How it works:**
- Select an association, billing period, and bill type (All / Maintenance / Electricity / Other Charges / Sinking Fund).
- Toggle between **Bills** mode (any status) and **Receipts** mode (paid-only).
- Results capped at 50 records. Units with no owner email on file are flagged and skipped.
- Confirmation dialog before sending (irreversible). Results summary shown after dispatch.
- Emails sent via Resend with the PDF bill or receipt attached (downloaded from Supabase storage).

**Email templates (`packages/email-templates`):**
- Two new react-email templates: `BillEmail` (amber amount-due box) and `ReceiptEmail` (green amount-paid box).
- Branding matches existing Ooruda OTP email - amber header bar, "ooruda" wordmark, warm-grey detail table.
- Added to `src/index.ts` and `src/registry.ts`.

**Security:**
- All server functions (`fetchAssociationsForDispatch`, `fetchBillsForDispatch`, `sendBillEmailsAction`) guarded with `isSuperAdmin()` - throws if caller is not a super admin.
- `billType` validated against a server-side whitelist (`VALID_BILL_TYPES`) before interpolation into PostgREST `.or()` filter - prevents filter injection.
- `RESEND_API_KEY` throws explicitly if undefined (no silent empty-string fallback).
- Resend HTTP errors are sanitized to `Email delivery failed (HTTP <status>)` - raw response body is not surfaced to the client.
- Both server files marked `import 'server-only'`.
- Dispatch events logged via `getLogger()` for audit trail.

**Shared config (`dispatch-config.ts`):** `DISPATCH_SENDER_EMAIL` and `VALID_BILL_TYPES` constants are shared between server and client to keep values in one place.

---

## v1.4 - Void Bills + Billing UX Polish - 2026-08-03

### UX Polish - Billing Dashboard & Drafts (batch 2)

**Screenshot 1 - Billing dashboard tiles:**
- All four KPI tiles now render at equal height. Added `h-full` to the `Tile` link wrapper and to `MetricCard`, so the tile with no sublabel (e.g. "This Month Billed" when percent is unavailable) no longer appears shorter than its neighbours.

**Screenshot 2 - Drafts page:**
- **Draft count fix:** Maintenance pending was counted as 1 item in both the "Items pending" summary chip and the Billing dashboard badge. Maintenance is not a stageable/quantifiable item - it has no amount until generation. Both counts now reflect only actual billable items (electricity invoices + other charges + sinking fund charges).
- **Maintenance chip:** Replaced the period-only chip with "August 2026 · Not yet generated" using a muted treatment so it reads as informational rather than a number to act on.
- **Maintenance section redesign:** Replaced the `DraftSection` card (which visually mimicked the electricity data table) with a distinct blue info banner, making it clear this is a notification about future generation rather than a list of staged items.
- **Page-level total:** Added a highlighted "Total charges" chip showing the sum of all quantified pending amounts (electricity + other charges + sinking fund) - giving an admin a single number when deciding whether to generate now or wait.
- **Button cursor:** Added a global CSS rule (`button:not(:disabled) { cursor: pointer }`) so all clickable buttons show the hand cursor on hover.

**Unit billing detail (Screenshot 3 - 7 fixes):**
- Bulk void button hidden on fully-paid periods.
- Bulk void button given a visible danger outline and "Void" text label.
- Void Bill button icon changed from XCircle → Ban (correct semantic icon for voiding).
- "Overdue Bills" stat tile hidden when overdueCount is 0 (reduces visual noise on healthy units).
- "Status:" label added before the unit status badge for clarity.
- Due date shows amber warning when bill is due within 7 days, with a "Nd left" countdown.
- Period label added above the due date in the bill detail panel.

### Feature: Cancel Bills

Administrators can now cancel (void) bills that were generated incorrectly, without deleting them. This preserves the full audit trail while allowing corrected bills to be re-generated for the same period.

**Key design decisions:**
- Only `assoc_admin` can cancel bills. Billing operators cannot.
- Bills with any payments or advance credit applied are blocked from cancellation - the admin must reverse those transactions first.
- A cancellation reason is mandatory.
- Bill numbers are permanently retired. Even after cancellation, the bill row stays in the database with its unique bill number, so the same number is never assigned to a new bill.
- After cancellation, new bills can be generated for the same unit/period/charge type - the generation logic skips void bills when checking for duplicates.

**Changes:**

**Database migration (`20260803000000_void_bill.sql`):**
- Added `'Void'` to the `bills.status` check constraint.
- Added `void_reason`, `voided_at`, `voided_by` audit columns to `bills`.
- Patched `sync_bill_payment_status()` trigger to skip status updates on already-voided bills (prevents payment aggregation from overwriting the Void status).
- Created `void_bill(bill_id, reason)` SECURITY DEFINER function - validates role, checks for payments, then marks the bill Void.
- Created `void_bills_bulk(association_id, period, bill_type, reason)` SECURITY DEFINER function - voids all eligible bills for a period, silently skipping any that have payments attached. Returns count of bills voided.

**Bill generation:** Added `.neq('status', 'Void')` to the existing bills check so voided bills are invisible to the duplicate-detection logic.

**UI - Single bill cancel:**
- A "Cancel Bill" button appears in the bill detail panel for `assoc_admin` users on bills with no payments.
- Clicking opens a confirmation dialog with a required reason field and a warning about irreversibility.
- Cancelled bills show a strikethrough label and no longer display a PDF download link.

**UI - Bulk cancel (period-level):**
- A trash icon appears next to the bill count in each period row for `assoc_admin` users.
- Opens a bulk cancel dialog showing the bill count for the period. Bills with payments are automatically skipped (not errored).

**Reports:** Outstanding bills queries in `reports-actions.ts` and `reports-client-page.tsx` now exclude `status = 'Void'` so cancelled bills don't inflate outstanding balances.

---

## Bug Fixes & UX Polish - 2026-07-31 (batch 3)

### Reports - PDF filter disclosure & tab-aware title

When a PDF is exported with unit or bill-type filters active, a "FILTERS APPLIED" info box now appears at the top of the PDF listing the exact units and charge types included - making the document auditable and unambiguous.

- Added `appliedFilters: { unitNos, billTypes }` to `ReportPdfData` and populated it server-side by resolving unit IDs to unit numbers (via RLS-scoped `units` table query) and mapping bill type slugs to human-readable labels.
- Applied to all tabs: Collection, Outstanding, Payments, and Electricity.
- The PDF title is now tab-specific when a single section is exported ("Collection Summary", "Payments Received", etc.) rather than always "Financial Report".
- Section numbers in multi-section PDFs are computed dynamically based on which sections are present - a two-section export like Collection + Electricity correctly shows "1." and "2." rather than "1." and "4.".

### Billing - Filter bar UX overhaul

- **Toolbar restructured**: Filter controls (search, selects, status pills) are on the first row; summary tiles (Units / Bills / Outstanding / Overdue) and the Download button are on a second row, shown only when results exist.
- **Active pill contrast**: Active filter pills now use `bg-primary text-primary-foreground` (solid fill) for guaranteed legibility.
- **Inactive pill border**: Non-active pills now show a visible `border-input` border instead of the previous transparent border.
- **Download count accuracy**: The export (`exportBills`) now applies the same status filter (`outstanding` / `overdue` / `all_paid`) as the displayed list, so the download count matches the visible row count.
- **Summary tiles restored**: Stats shown in `bg-muted/50` tile boxes, matching the Payments page visual language.

### Code quality - Type safety improvements

- `TabKey` extracted to `reports-types.ts` as a shared type, imported by both `export-button.tsx` and `reports-client-page.tsx`.
- `activeTab` state is now typed as `TabKey` end-to-end, eliminating `as TabKey` casts.
- `elecBillsRes.error` guard added to electricity consumption fetch - prevents silent zero-charge display when the bills query fails.

---

## Bug Fixes & UX Polish - 2026-07-31 (batch 2)

### Reports - Export PDF & CSV now tab-scoped

Export PDF and Export CSV now generate content based on the **currently active tab**, not a full multi-section summary report.

- **PDF**: Passes the active tab to the server action, which only fetches and renders the relevant section (Collection, Outstanding, Payments, or Electricity). Unused sections are suppressed in the PDF template via the new optional `activeSections` field on `ReportPdfData`.
- **CSV**: Was already tab-scoped; no change needed.
- Export button description updated from "Full summary report" to "Current tab · applies active filters".

### Reports - Unit-wise Consumption now populated

The "Unit-wise Consumption" section on the Electricity tab previously always showed "No meter readings found for this period" because `consumptionByPeriod` was hardcoded to `{}`.

- Now fetches `meter_readings` (joined through `sub_meters → units`) for the mescom bill IDs loaded in the electricity tab.
- Also fetches `bills` where `bill_type = 'electricity'` for those periods to populate the "Charged" column.
- Filters to `meter_type = 'Unit'` only (excludes common-area sub-meters).
- Rows with zero consumption are excluded from the chart/table.

### Billing - Filter pill active state contrast fixed

Active/selected status filter pills (All Units / Outstanding / Overdue / All Paid) used `bg-primary/10 text-primary` - a 10% opacity tint that caused illegible text in many themes.

Changed to `bg-primary text-primary-foreground border-primary` for solid, guaranteed contrast regardless of theme.

---

## Foundation - Week 0 (Jun 13–18, 2026)

Initial project setup on top of Makerkit v3.4.1. This phase established the core domain schema, authentication model, and role system.

### Domain Schema

A complete PropTech domain was introduced via a single foundational migration (`20260612000000_ooruda_domain.sql`), establishing:

- **Associations** - the top-level entity (1:1 with a Makerkit team account); stores address, GSTIN, GST flag, electricity provider consumer number, brand color, logo URL, and status (Setup / Active / Suspended)
- **Units** - individual units within an association with type (Shop / Office / Warehouse), floor, area in sq.ft, owner assignment, and status
- **Tenancies** - tenant-to-unit assignments with start/end dates; one active tenancy per unit enforced by constraint
- **Sub-meters** - electricity sub-meters per unit (Unit or Common Area type)
- **Electricity bills** (initially "MESCOM bills") - monthly utility provider invoices with invoice amount, block consumption units, and effective rate
- **Meter readings** - per sub-meter readings linked to an electricity bill
- **Charge types** - configurable per-association charge definitions (electricity, maintenance, other charges) with calculation method (per sq.ft / flat / per unit / electricity), frequency, default payer, and GST flag
- **Bills** - generated billing documents per unit per period with total, paid amount, and status (Unpaid / Partial / Paid / Void)
- **Bill line items** - itemized rows within a bill
- **Payments** - payment records with mode, reference, and payer role
- **Receipts** - payment receipts with PDF URL
- **Audit logs** - structured event log (action, entity type, actor, metadata)
- **Notifications** - in-app notification log per user
- **Profiles** - extends auth users with full name and mobile number (phone OTP login identity)
- **Billing settings** - per-association defaults for electricity due day, maintenance due day, other charges due day, and reminder schedules

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
| `prop_owner` | Property owner - can view their unit bills and payment history |
| `tenant` | Tenant - can view their unit bills |

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

## Release v1.0 - Week 1 Core Features (Jun 21–26, 2026)

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

## Release v2.1 - Polish & Infrastructure (Jun 26–29, 2026)

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

## Release v3.0 - Week 3 Part 1 (Jun 29–Jul 1, 2026)

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

## Release v3.1 - GST, Bulk Invite & Performance (Jul 2–12, 2026)

### Billing: GST Support

- **GST-inclusive bill generation**: When GST is enabled at the association level, generated bills now include the GST amount in the payable total. Electricity is excluded (pass-through billing); maintenance and other charges are taxable by default.
- **Per-charge-type GST control**: The Charge Types card in Association Settings shows a GST toggle per charge type (visible only when association GST is enabled), allowing admins to mark individual charge types as taxable or exempt.
- **Bill breakdown popup**: View Breakdown now shows subtotal, CGST, SGST, and GST-inclusive total as a compact summary below the line items.
- **PDF bill updated**: Shows subtotal, CGST and SGST lines, and a GST-inclusive "Bill Amount (Payable)" when applicable.

### Association: Registration Number

- New **Registration Number** field on the association, editable in Billing Settings.
- Printed in the PDF header on both bills and receipts, below the address and above the GSTIN.

### Owner/Tenant: Self-Service Razorpay Payments

- **Per-association Razorpay credentials**: Each association has its own Razorpay Key ID and Key Secret stored in a new `association_payment_gateways` table. Credentials are server-only (no authenticated RLS policy - service role only) and the secret never reaches the client.
- **Super admin gateway config**: Admin → Accounts → [Association] now has a "Payment Gateway" card. Super admin enters/updates Key ID, Key Secret, optional Webhook Secret, and toggles active status. Editing with blank secret preserves the existing secret.
- **"Pay ₹X" per bill**: When the association has an active gateway, `prop_owner` and `tenant` see a "Pay ₹X" button on each unpaid/partial bill row in the Payments page.
- **"Pay All - ₹Y" button**: If multiple bills are pending, a single "Pay All" button appears at the top. It creates one Razorpay order for the total outstanding and settles each bill individually after payment verification.
- **Secure checkout flow**: `POST /api/billing/razorpay/create-order` creates the order server-side using the association's key; `POST /api/billing/razorpay/verify` verifies the HMAC-SHA256 signature before calling `record_payment()` for each bill.
- **Batch grouping**: Multi-bill payments share a `payment_batch_id` UUID for future grouped reporting.
- **Duplicate payment protection**: Composite unique index `(razorpay_payment_id, bill_id)` prevents double-recording a payment for the same bill.
- **Page auto-refresh**: After successful payment, `router.refresh()` is called so bill statuses update immediately without manual reload.
- **Extensible design**: `provider` column in gateway table and `payment_batch_id` are forward-compatible with future gateways (PayU, CCAvenue) and batch reporting.

### Admin: Bulk CSV Member Invite

- Super admins can now invite members in bulk via CSV upload from the Admin → Accounts page.
- Three-step flow: upload CSV → preview parsed rows → view import results.
- CSV format: `phone, name, email, role, association_name` - all columns mandatory. Invalid or incomplete rows are skipped with a reason shown in the results.
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

- Billing Settings page now loads significantly faster - database queries are parallelised and a loading spinner is shown while the page fetches data.

---

## Release v4.0 - Razorpay Self-Service Payments & Unit-Scoped Pay All (Jul 3, 2026)

Branch: `week-4`

### Self-Service Online Payments (Razorpay)

- **Per-association Razorpay gateway**: Super admins configure `key_id`, `key_secret`, `webhook_secret`, and toggle active/inactive per association in Admin → Accounts → [Association] → Payment Gateway card. Credentials are stored server-side only - `key_secret` is never sent to the client.
- **Pay individual bill**: `prop_owner` and `tenant` see a "Pay ₹X" button on each unpaid/partial bill in the Payments page. Clicking opens the Razorpay checkout modal (UPI, card, netbanking, etc.).
- **Pay All Pending**: When a specific unit tab is selected and there are 2+ pending bills, a "Pay All - ₹X" button appears in the card header. This creates one Razorpay order covering all pending bills for that unit; each bill gets a separate payment record linked by a shared `payment_batch_id`.
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

## Release v3.5 - Door Number, Electricity Load & Ooruda Branding (Jul 14, 2026)

### Units: Door Number Field

- Optional `door_no` column added to `units` table.
- Editable in Add Unit and Edit Unit dialogs.
- Included as an optional `door_no` column in the units CSV import template; shown in the preview table.
- Door number appears on electricity bills, maintenance bills, and payment receipts (if set) - shown beneath the unit number.

### Electricity: Sub-meter Sanctioned Load (kVA)

- Optional `load_kva` column added to `sub_meters` table.
- Editable in Add Sub-meter dialog (new "Sanctioned Load (kVA)" field).
- Shown in the sub-meters table as a "Load (kVA)" column.
- Included as optional `load_kva` column in the sub-meters CSV import template; shown in the preview table.
- If any sub-meter has a load value, a note is shown below the electricity bill PDF's meter readings table: "Sanctioned Load - SM-1: 2.5 kVA | SM-2: 3.0 kVA", helping customers understand the basis for minimum charges.

### Association Settings: Sanctioned Association Load (kVA)

- Optional `sanctioned_load_kva` column added to `associations` table.
- New "Sanctioned Load (kVA)" field in the Electricity card of association settings.
- Stored for future calculations (not shown on individual bills).

### Bills & Receipts: "Generated from Ooruda" Footer

- All bill PDFs (maintenance, other charges) and payment receipts now show "Generated from [Ooruda](https://ooruda.com/)" as a clickable hyperlink in the footer.
- Electricity bill PDF updated to match (was previously using its own inline footer).

---

## Release v3.3 - Electricity Enhancements & Dashboard Improvements (Jul 3, 2026)

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

- **Bulk import sub-meters via CSV** - new "Import Sub-meters" button visible only to super admins in the Sub-meters section.
- CSV columns: `unit_no`, `sub_meter_no`, `meter_type` (`Unit` or `CommonArea`).
- Existing sub-meters are skipped (no overwrite); duplicates within the same batch are deduplicated.
- CommonArea meters use the alphabetically-first unit as FK anchor (deterministic across imports).
- Insert uses admin client to bypass RLS, consistent with other super-admin operations.
- Preview table + skipped-rows result view, same UX as meter readings import.

### Electricity: Meter Readings CSV - Optional Previous Reading & Minimum Charge

- `previous_reading` and `minimum_charge` columns added to the meter readings CSV as **optional overrides**.
- If blank, zero, or non-numeric - existing/derived values are used (no behaviour change for current CSVs).
- If a valid number > 0 is supplied - that value is used, enabling bulk test data uploads with explicit values.
- Template and preview table updated to show the new columns.

### Audit Log: Search & UX Improvements

- **Instant search** - debounced as-you-type (300ms) across event name, details, and actor name; results update without pressing Enter.
- **Actor name search** - searches profiles via admin client so super-admin actors resolve correctly; name-matched user IDs are passed as a typed `.in()` filter.
- **Super Admin badge** - actors not in the account's membership (super admins) now show a red "Super Admin" role badge instead of a dash.
- **Column renames**: Action → Event, Actor → User, Entity → Details, Timestamp → Date.
- **Truncated error details**: Long error messages trimmed to 90 characters; raw JSON payloads replaced with "An error occurred."
- **Corrected action labels** - all label keys now match exact DB action values (`mescom_bill.created`, `bills.generated`, `meter_readings.recorded`, etc.) covering all success and failure variants.
- **Wording fix** - audit summary for electricity bill creation changed from "Uploaded Electricity bill" to "Added electricity bill".

### Electricity Bill PDF: Redesign

- **Association logo** - shown in the header via the shared `DocumentHeader` component (falls back to Ooruda mark if no logo set).
- **Association address** - included in the header.
- **Navy colour scheme** - professional deep navy (`#1a3a5c`) for title strip, table header, and total row; replaces the previous bright blue.
- **SL column** and alternating row shading added to the meter readings table.
- **Minimum charge row** - amber-tinted to visually distinguish it.
- **Receiver's Signature + Authorised Signatory** - both signature blocks shown side by side at the bottom, matching the standard bill format.

---

## Release v3.2 - GST, Bulk Invite & Electricity Reconciliation (Jul 3, 2026)

### GST Support

- **Association-level GST toggle**: Enable GST for the entire association via Settings → Association → GST Enabled. Set GSTIN and GST rate (%).
- **Per-charge-type GST flag**: Each charge type has an independent "GST applicable" toggle. Electricity is always excluded (pass-through billing). Maintenance and other charges default to enabled when association GST is on.
- **GST inclusive billing**: When GST is enabled and applicable to a line item, `gst_amount` is stored on the bill. The bill breakdown popup shows subtotal, CGST + SGST split, and GST-inclusive total.
- **PDF updates**: Bill PDF shows a GST column per line item and a summary block with CGST/SGST rates and amounts.

### Association Settings

- **Registration number**: Associations can now store an official registration number; shown in PDF headers.
- **Charge Types card improvements**: Column headers (GST / Active) added; both toggles are now `Switch` components (consistent UI); electricity shows a dash with tooltip instead of a GST toggle.
- **Billing Settings parallelisation**: Settings page queries now run with `Promise.all` instead of sequentially - reduces page load time.
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
| `20260729000002_collection_summary_advance.sql` | Jul 29 | Advance credit support in collection summary |
| `20260731000000_query_performance.sql` | Jul 31 | Query performance indexes |
| `20260803000000_void_bill.sql` | Aug 3 | Void bill support |
| `20260804093956_reconcile_schema_drift.sql` | Aug 4 | Reconcile schema drift |
| `20260804143333_smoke_test_push_workflow.sql` | Aug 4 | Smoke test migration for push workflow verification |
| `20260805000001_auto_tag_test_phone_users.sql` | Aug 5 | Auto-tag `profiles.is_test = true` for phones starting with `+91991100` or `+9199999`; trigger for new users |

---

## Release v3.6 - Continuous Bill Numbering (Jul 15, 2026)

### Bill Numbering Overhaul

Previous bill numbers reset their sequence counter every billing period (`YYMM` segment), producing `…-2606-001`, `…-2607-001` - a new series each month. This was incompatible with Indian GST filing requirements, which expect a single unbroken series within a financial year.

**New format:** `{Prefix}-{Type}-{FYSTR}-{NNNN}`
- `FYSTR` is the financial year string (e.g. `2627` for April 2026 – March 2027)
- `NNNN` is a 4-digit zero-padded sequence that increments continuously across months, resetting only on April 1 each year
- Three independent series per association per FY: `MANT`, `ELEC`, `OTHR`

**Examples (same association, same FY):**
- June maintenance bill: `OOR1A2B-MANT-2627-0001`
- July maintenance bill: `OOR1A2B-MANT-2627-0002`
- August electricity bill: `OOR1A2B-ELEC-2627-0001`

Old bills retain their original numbers (issued documents cannot be renumbered). The two formats are visually distinct - old numbers have a `YYMM` segment, new ones have a `FYSTR`.

**Atomicity fix:** The old sequence was computed in application code by scanning existing bills, creating a race-condition window for concurrent billing runs. The new `allocate_bill_no()` Postgres function uses `INSERT … ON CONFLICT DO UPDATE … RETURNING` to allocate the next sequence number atomically, eliminating that risk.

### PDF Cleanup - Payer/Paid By Removed

The "Payer" column (Owner / Tenant) has been removed from bill PDF line items, and the "Paid By" field has been removed from receipt PDFs. These internal routing labels are not required on externally facing documents.

---

## Release v3.7 - Billing Entity, Bill-To Override, PAN, Type-to-Confirm & Ooruda Branding (Jul 6, 2026)

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

- **Bill number RPC**: Removed unnecessary `as any` cast from the `allocate_bill_no` RPC call - the function is already typed in `database.types.ts`.
- **Audit logging**: Sequence-allocation failures now emit a structured `logAuditEvent` entry instead of a bare `console.error`.
- **Sub-meter CSV validation**: CommonArea rows now require `unit_no = COMMON`; using a real unit number raises a parse-time error explaining that `unit_no` is ignored for CommonArea meters.
- **Meter readings CSV**: `current_reading` validation error message corrected from "positive number" to "non-negative number" (a reading of 0 is valid for a new meter).
- **Electricity bill PDF**: Footer extracted to shared `DocumentFooter` component (no duplicate Ooruda link).

### Dependencies

- `@supabase/postgrest-js` bumped from `2.106.2` → `2.109.0` (minor patch).
- `@supabase/phoenix` bumped from `0.4.2` → `0.4.4`.

---

## Release v4.0 - Association Onboarding & XLSX Import (Jul 7, 2026)

Branch: `week-4-enhancements`

This release focuses on onboarding associations with their existing data. All import dialogs now accept Excel (XLSX) files alongside CSV, and the system understands the specific column formats used by associations in their own records.

### Shared Spreadsheet Parsing Utility

- New `apps/web/lib/parse-spreadsheet.ts` shared utility using SheetJS (`xlsx`).
- `parseSpreadsheetFile(file)` - detects `.xlsx` vs `.csv` by extension; normalises all headers to `lowercase_with_underscores`; returns `Record<string, string>[]`.
- `downloadXlsxTemplate(filename, headers, sampleRows)` - generates and downloads XLSX import templates.
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
| `initial_reading` | `numeric(12,2)` | Last recorded reading before onboarding - used as the `previous_reading` fallback when calculating the first electricity bill |
| `minimum_charge` | `numeric(10,2)` | Default monthly minimum charge for this meter - auto-filled on every meter reading without a per-reading override |

**Sub-meter import** (CSV/XLSX) accepts association column aliases:

| Association column | System column |
|---|---|
| `INITIAL_METER_READING` | `initial_reading` |
| `MIN_CHARGES` | `minimum_charge` |

Both fields are optional (default 0). Preview table shows Init. Reading and Min. Charge columns.

### Electricity: Simplified Meter Readings Import

The meter readings import was completely rewritten to match the format associations will supply:

- **New format**: `SUB_METER_NO, CURRENT_METER_READING` only (2 columns).
- Sub-meters are looked up by their label (`meter_label`) within the association - no unit number needed.
- **Previous reading** auto-filled: last recorded reading before the selected period, falling back to `sub_meter.initial_reading` for newly onboarded meters.
- **Minimum charge** auto-filled from `sub_meter.minimum_charge` - no per-row override needed.
- **Duplicate detection**: duplicate sub-meter labels within the file are rejected at parse time with a clear error.
- CommonArea meters are included naturally - their `meter_label` (e.g. `Common-Lift`) identifies them directly.
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

Since the sum of individual sub-meter readings is always less than the MESCOM main meter reading (due to building transmission losses), the new rate is proportionally higher - ensuring the full MESCOM invoice is always recovered from occupants. Losses are distributed proportionally based on each unit's consumption. CommonArea sub-meters are included in the denominator.

This change affects both bill generation and electricity bill PDFs (which show the per-unit rate in the meter breakdown table). The PDF generation was also optimised to fetch all meter readings in a single query (instead of two), using the database-generated `consumed_units` value directly.

### Dependencies

- `xlsx` (SheetJS) added to `apps/web` and `packages/features/admin` for XLSX parsing and template generation.

### Admin Panel: Test vs Real Tagging

- `is_test` boolean column added to both `associations` and `profiles`.
- Two test associations renamed: Abish Association → **Sandbox Residency**, Prestige Meadows → **Demo Towers**. Both marked `is_test = true`.
- Eleven test users (phone numbers `+919911000001–020`) renamed to a `[Role] T. [Descriptor]` pattern (e.g. Arjun T. Admin) and marked `is_test = true`.
- **Test badge**: amber "Test" tag shown next to the account name in the admin accounts list and on the team account detail page for test associations/users.
- **Kind filter**: new "Kind" dropdown in the admin accounts table - filter to "All", "Real", or "Test". Filtering is server-side (accounts table queried with `.in()` / `.not().in()` against the precomputed test account ID set).

### Admin Bulk Invite: XLSX Data Cleaning & Owner Enrichment

Improvements to handle real-world data quality issues found in association-supplied XLSX files:

- **Phone normalisation**: `cleanPhoneCell()` strips Excel float suffixes (`9876543210.0` → `9876543210`), collapses internal spaces (`94482 53545` → `9448253545`), and trims trailing whitespace before the `+91` prefix is added.
- **Unit number float cleanup**: `cleanUnitNo()` converts Excel-numeric cells that arrive as `"101.0"` → `"101"`. Alphanumeric unit numbers (e.g. `G1A`) are passed through unchanged.
- **Company owner detection**: `isCompanyName()` matches common Indian business entity suffixes (LLP, Pvt Ltd, Limited, Buildcon, Infotech, Management, Realty, etc.). When the owner name matches, `owner_is_company = true` and `owner_company_name` are written to the unit - no invite is suppressed, a contact is still created under that phone.
- **SELF OCCUPIED firm name capture**: when a SELF OCCUPIED row has a grey-cell tenant/organisation name (the occupying firm), it is stored as `owner_company_name` on the unit for billing purposes. No tenancy row is created. If both the owner and tenant organisation are companies, the tenant company name takes priority as the billing entity.
- **Joint ownership name handling**: when `OWNER_NAME` contains ` & ` (e.g. `UJWAL N SALIAN & HARSHALATHA U SALIAN`), only the first name is used for the account - one account per phone number.
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

## Release v4.1 - Unit Status Overhaul & CSV Column Restructure (Jul 8–9, 2026)

### Unit Status: Self Occupied / Rented

- Replaced the single `Occupied` status with two distinct values: **Self Occupied** (owner, no active tenant) and **Rented** (active tenant)
- **Vacant** now means the unit has no owner (not yet sold / still with builder)
- Status transitions: adding an owner → Self Occupied; adding a tenant → Rented; ending tenancy → reverts to Self Occupied
- Units table filter updated: "Occupied" filter now matches both Self Occupied and Rented; new sub-filters for each
- Association dashboard occupancy count updated to include both new statuses
- Bulk XLSX import: `unit_status` column now accepts `Self Occupied`, `Rented`, `Vacant`

### Electricity: CSV Column Restructure

- **Sub Meter CSV** now only has: `UNIT_NO, SUB_METER_NO, METER_TYPE, INITIAL_METER_READING`; `LOAD_KVA` and `MIN_CHARGES` removed
- **Current Readings CSV** now includes optional columns: `LOAD_KVA, MIN_CHARGES` - allow per-period overrides without touching the sub-meter record
- Blank CSV value for `LOAD_KVA` / `MIN_CHARGES` → carry forward last month's recorded value automatically (no overwrite)
- Full fallback chain: (1) CSV value → (2) existing reading for this bill → (3) most recent prior-period reading → (4) sub-meter default → (5) 0/null
- New `load_kva` column added to `meter_readings` table for per-reading tracking
- Dialog instructions updated to reflect the new column structure and fallback behaviour

### Multi-Role Members: assoc_admin as Owner/Tenant

- An `assoc_admin` can now be assigned as unit owner or tenant - the eligibility check now accepts `assoc_admin` in addition to the specific `prop_owner`/`tenant` role
- A member who owns one unit and rents another in the same association now sees bills for both on the payments page - unit IDs are unioned from ownership and active tenancies instead of branching on a single role
- Bulk XLSX invite: `assoc_admin` rows that carry a `unit_no` now write `owner_id` on the unit (admins are assumed to be unit owners; if an admin is a tenant, include a separate `tenant`-role row)

### Bug Fix: Bulk Invite Unit Linking

- Fixed: unit association FK was resolved to `accounts.id` instead of `associations.id` (different UUIDs), causing all unit updates to silently fail
- Added a second lookup map `assocRowIdByAccountId` to correctly resolve `associations.id`

### Migrations

| Migration | Description |
|---|---|
| `20260708000001_unit_status_self_occupied_rented.sql` | Drop old `Occupied` CHECK; migrate data; add new CHECK for `Self Occupied`, `Rented`, `Vacant` |
| `20260709000001_meter_readings_load_kva.sql` | Add nullable `load_kva` column to `meter_readings` |

## Release v4.2 - Electricity Unit Rate & Audit Log Improvements (Jul 9, 2026)

### Electricity Bills: Unit Rate Column

- Added **Unit Rate** column to the electricity bills table - shows the effective rate charged to residents (`MESCOM invoice ÷ total sub-metered consumption`), distinct from the Block Rate (`invoice ÷ MESCOM block units`)
- Both rates are now visible side by side, making it clear when MESCOM block units differ from actual sub-meter consumption
- Footer text updated to accurately describe both rates
- Defensive guard added: Block Rate and Unit Rate both display `-` when the denominator is zero (previously could render `Infinity/unit`)

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

## Release v4.7 - Razorpay Async Webhook (Jul 9, 2026)

Branch: `week-4`

### Razorpay Async Webhook Safety Net

Handles the edge case where a user pays on Razorpay but the synchronous `/verify` call never reaches the server (browser closed, network drop, etc.). Razorpay retries the webhook until it gets a 200, so no payment is ever silently lost.

**New route `app/api/billing/razorpay/webhook/route.ts`:**
- Receives `payment.captured` events from Razorpay (all other events acknowledged and ignored)
- Reads raw body before parsing for correct HMAC-SHA256 signature verification (`X-Razorpay-Signature` header vs `webhook_secret`)
- Rejects requests if `webhook_secret` is not configured in gateway settings (prevents spoofing)
- Reads `bill_ids`, `association_id`, `paid_by_role` from Razorpay order `notes` - no separate lookup table needed
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

## Release v4.6 - Overdue Status Code Compatibility (Jul 9, 2026)

Branch: `week-4`

### Status Filter & Dashboard Fixes

Companion fix for the `recompute_overdue_bills()` cron introduced in v4.5. The cron stores `'Overdue'` directly in `bills.status`, but all existing filter/display code assumed that status was always computed client-side and never stored. Updated four locations to handle `status='Overdue'` from the DB:

- **`billing/_components/bills-section.tsx`** - overdue filter tab now also matches `b.status === 'Overdue'`
- **`payments/_components/payments-section.tsx`** - overdue filter tab + Pay All Pending button include `'Overdue'` bills
- **`units/page.tsx`** - DB query changed from `.eq('status', 'Unpaid')` to `.in('status', ['Unpaid', 'Partial', 'Overdue'])` so overdue units still show their badge count
- **`_components/association-dashboard.tsx`** - outstanding balance calculation includes `'Overdue'` bills

Both migrations (`20260702000004_razorpay_gateway`, `20260709112744_overdue_and_reminder_cron`) pushed to remote.

---

## Release v4.5 - Overdue Recompute & Reminder Cron (Jul 9, 2026)

Branch: `week-4`

### Automated Bill Status & Reminders

**Migration `20260709112744_overdue_and_reminder_cron.sql`:**
- Enables `pg_net` extension for outbound HTTP from the database
- `public.recompute_overdue_bills()` - SQL function that transitions `Unpaid`/`Partial` bills to `Overdue` where `due_date < current_date`
- `cron.schedule('overdue-recompute', '30 19 * * *', ...)` - fires daily at 1 AM IST; runs the overdue recompute function
- `cron.schedule('send-reminders', '30 3 * * *', ...)` - fires daily at 9 AM IST; calls the `send-reminders` Edge Function via `pg_net`

**New Edge Function `supabase/functions/send-reminders/index.ts`:**
- Reads each association's `billing_settings.reminder_schedule_json` (`days_before` + `days_after` arrays)
- Finds bills due on matching dates (e.g. 3 days before due, 1 day after due)
- Batch-fetches unit owners and active tenants; batch-fetches phone numbers
- Sends SMS via the same provider logic as `custom-sms-hook` (mock/MSG91/2Factor)
- Logs every attempt to `notifications_log` with type `due_date_reminder` or `overdue_reminder`

**Prerequisite:** One-time DB GUC configuration needed before reminder cron fires - see TODO.md → "Pre-launch: Cron Job Configuration".

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260709112744` | pg_net extension, `recompute_overdue_bills()` function, overdue + reminder cron schedules |

---

## Release v4.4 - Notification Event Wiring (Jul 9, 2026)

Branch: `week-4`

### SMS Notifications - Billing Events

Wired billing events to send SMS notifications to owners and tenants via the existing `packages/sms` infrastructure.

**SMS package extended (`packages/sms`):**
- Added `sendSms(phone, message)` to `ISmsProvider` interface and all three providers (Mock, MSG91, 2Factor)
- MSG91: uses Flow API with `MSG91_SMS_FLOW_ID` + `MSG91_SMS_SENDER_ID` env vars for DLT-compliant transactional SMS
- 2Factor: uses TRANS_SMS endpoint

**New notification service (`apps/web/lib/notify.ts`):**
- `sendBillGeneratedNotifications(associationId, unitIds, monthLabel)` - batch fetches owners + active tenants for all billed units in two queries, then sends in parallel; fire-and-forget (never blocks billing)
- `sendPaymentConfirmedNotification(params)` - single-user payment receipt SMS

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

## Release v4.3 - Razorpay Gateway Config UI (Jul 9, 2026)

Branch: `week-4`

### Payment Gateway Settings

Added an admin-only **Payment Gateway** settings card to the Association Settings page (`/settings/association`), completing the Razorpay self-service payment setup flow:

- **Key ID / Key Secret / Webhook Secret** fields - credentials stored server-side via admin client; secrets never serialised into the React tree
- **Enable online payments** toggle - controls `is_active` on `association_payment_gateways` per association
- Insert vs update logic - first save creates the row (key secret required); subsequent saves allow partial updates (blank secret = keep existing)
- Secret presence shown as `has_secret: boolean` indicator only - actual values never reach the client
- Success/error toast feedback; `data-test` attributes on all interactive elements

---

## Bug Fix - Super Admin Association Name / Logo Save

Branch: `week-4`

### Super Admin Write Access for Account Name and Logo

Fixed "Couldn't save your changes" error when a super admin tried to update an association's name or logo from the Association Settings page.

**Root cause:** The `accounts_settings_manage_update` RLS policy and the `account_image` storage policy both gate on `has_permission(auth.uid(), account_id, 'settings.manage')`, which checks `accounts_memberships`. Super admins are not actual members of associations they're inspecting, so `has_permission` returned false - blocking the `accounts` UPDATE and the storage upload even though `association_role()` correctly returns `'assoc_admin'` for super admins.

**Fix (`20260716000001_super_admin_account_write_access.sql`):**
- `accounts_settings_manage_update` policy: added `public.is_super_admin()` OR-branch to both USING and WITH CHECK clauses
- `account_image` storage policy: added `public.is_super_admin()` OR-branch to the WITH CHECK clause (read access was already gated on `has_role_on_account` which super admins pass via existing bypass)

---

## Bug Fix - Bulk Invite: existing users skipped on phone/email conflict (v4.9)

Branch: `week-4`

Users who already existed in `auth.users` but were absent from (or had a mismatched format in) `profiles.mobile_number` were not found by the upfront profile lookup. `createUser` then failed with "Phone number already registered by another user" or "This email address is already registered", and the row was skipped entirely - leaving them without association membership.

**Initial fix (v4.9):**
- When `createUser` fails with a phone or email conflict, recover by looking up the existing `auth.users` row via new service-role-only DB functions (`get_user_id_by_phone`, `get_user_id_by_email`) and fall through to the membership insert instead of skipping.
- Migration `20260716000002_get_user_id_by_phone.sql`: adds both lookup functions, restricted to `service_role`.

---

## Bug Fix - Bulk Invite: comprehensive upfront auth.users lookup (v4.10)

Branch: `week-4`

The v4.9 reactive fix was incomplete: users whose phone/email was later removed from `auth.users` (or whose auth credentials differed from the CSV) were still skipped because the initial lookup only queried `profiles.mobile_number`, which can be stale or missing.

**Root cause:** the upfront resolution used `profiles.mobile_number` - a denormalized field that may be null, cleared, or in a different format after a previous import to another association. Users existed in `auth.users` under their original credentials but didn't appear in the profiles query.

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

## Release v5.0 - Billing UX overhaul, bill number format v2, font & PDF fixes (Jul 17, 2026)

### Billing: Draft Bills tab

A new **Draft Bills** tab sits alongside **Generated Bills** on the Billing page, giving admins visibility into staged-but-not-yet-published charges before clicking Generate Bills.

- **Maintenance** - always shown for the current month if no maintenance bills have been generated yet
- **Electricity** - shows each `mescom_bills` entry whose period has no generated unit bills yet
- **Other Charges** - lists all rows in `pending_other_charges`
- Summary bar mirrors the Generated Bills metrics strip (section counts, totals)
- Type and period filters; Other Charges paginate at 20 rows per page
- Tab badge counts section groups (max 3), not individual items, matching the in-tab summary
- Hint text ("These bills are staged…") positioned below filters; neutral section styling matching Generated Bills

### Billing: Bill number format v2

New format: `{INITIALS}/{FY}/{TYPE}/{NNNNNN}`  
Example: `PRM/26-27/MNT/000001`

- **INITIALS** - first letter of each word in the association account name, up to 3 words (e.g. "Prashanth Residency Manor" → `PRM`)
- **FY** - Indian financial year formatted as `YY-YY` (e.g. `26-27`)
- **TYPE** - `MNT` (maintenance), `ELT` (electricity), `OTH` (other charges); future: `SNK`, `DGU`
- **NNNNNN** - 6-digit zero-padded counter, independent per (association, type, financial year)
- Existing bills keep their old format; duplicate-detection guards handle both old and new formats
- `bill_sequences` check constraint expanded to allow both legacy codes and new codes

### Electricity & Billing: period selector fixes

- Electricity period selectors (Add Bill, Import Meter Readings) now exclude the current month - electricity billed this month is for last month's consumption
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

## Bug Fix - Exclude Common Area from Units List and Dashboard Counts (Jul 10, 2026)

### Units & Dashboard: Common Area Filtering

- **Units Page** - `Common Area` type units are now filtered out from the main Units & Owners page table and metric cards (Total, Occupied, Vacant). This prevents them from incorrectly counting towards vacant commercial/residential spaces.
- **Dashboard** - `Common Area` type units are also excluded from the total units and occupied units counts on the association overview dashboard.
- **Database** - Common Area units remain in the database to support electricity sub-meters and utility billing mapping.

---

## Billing PDF Redesign, Tenancy Data Isolation, Super-Admin Bulk Delete (Jul 18–21, 2026)

### PDF Redesign - Bill, Receipt, Electricity Bill

- Header: association logo enlarged (~2x), name font reduced for balance, single continuous separator rule (was two segments with a decorative gap that read as "broken")
- Contact strip now shows `Email:` / `Phone No:` labels instead of bare values
- Unit floor formatted as ordinal ("2nd Floor", "3rd Floor", "11th Floor", "Ground Floor", "Basement N") in Bill To / Received From addresses
- Line item descriptions now read "{Charge Name} for {Month Year}" (e.g. "Maintenance for July 2026")
- Electricity bill: added "Electricity Bill for {Month Year}" caption above the meter table; renamed Previous/Current columns to "Previous Reading"/"Current Reading"; removed the Paid/Outstanding panel and both signature blocks; colors aligned to the shared navy/cream palette
- Bank details, brand colors, header/footer layout matched to the association's reference invoice template

### Per-sqft Maintenance: Area & Rate columns

- `bill_line_items` gained nullable `area_sqft` / `rate_per_sqft`, populated only when the charge type is `calc_method = 'per_sqft'` at generation time
- Bill PDF and the in-app "View breakdown" dialog show Area (sq.ft) / Rate/sq.ft columns after Description, but only when at least one line item on that bill actually has them - an association fully on a per-unit/flat maintenance model renders the plain table, and historical per-sqft bills keep their original values even after a later switch to per-unit billing

### Tenancy Data Isolation (privacy fix)

- Bills/payments previously had no link to the tenancy that was active when they were generated, so a **new tenant on a unit could see every past tenant's bill/payment history** (amounts, payment mode, receipt numbers) once assigned to that unit
- Added `bills.tenancy_id`, stamped at generation time from the unit's currently active tenancy; backfilled for existing bills by matching period against tenancy date ranges
- PDF download authorization now checks that a tenant's own tenancy matches the bill's `tenancy_id` (owners are unaffected - they still see every bill for units they own)
- "Bill To" on a bill/receipt now resolves from the bill's own recorded tenancy, not whichever tenancy happens to be active *now* - prevents an old bill's payer name from silently changing after a tenant turnover and PDF cache regeneration
- Owner dashboard and Payments page bill/payment lists scoped the same way for rented units

### Super-Admin Bulk Delete

- "Delete all bills" (billing page) and "Delete all payments" (payments page) buttons, visible only to super admins (checked independently of the `assoc_admin`-equivalent role granted when viewing an opened workspace)
- Type-to-confirm (association slug) dialog showing live bill/payment/receipt counts before deletion
- Backed by `security definer` RPCs (`super_admin_delete_all_bills`, `super_admin_delete_all_payments`) with an explicit `is_super_admin()` check inside - not reliant on RLS, since RLS can't distinguish a real assoc_admin from an impersonating super admin
- Deleting bills cascades to line items/payments/receipts, resets bill numbering, and cleans up orphaned cached PDFs from storage; deleting payments leaves bills intact (they revert to their unpaid state)

### Bug fixes

- Owner dashboard "Total Amount Due" only checked for `status IN ('Unpaid','Partial')`, missing bills already persisted as `'Overdue'` - such bills silently dropped out of the outstanding total, showing "All paid" when money was actually owed
- Owner dashboard "Bill history" / "My payments" cards hard-capped at 3 items with no way to see the rest - a unit with 5 bills only showed 3
- `admin-account-page.tsx`: the newly-added `profiles.mobile_number` phone fallback was unreachable because `??` doesn't treat `''` (the typical value of `auth.users.phone` for phone-OTP-only accounts) as absent - switched to `||`
- `GenerateBillsSchema`: a `.refine()` meant to give a friendly "Please select a bill type" message could never fire (the underlying `z.enum()` already rejects `undefined` before refine runs) - moved the message onto the enum itself
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

## Release v4.12 - PDF & Receipt Fixes (Jul 22, 2026)

### Electricity Bill PDF
- **Sub-meter and total rows** now render with a white background (previously inherited an unintended cream background)
- **Line descriptions renamed**: the meter reading row now reads "Electricity Charges for &lt;Month Year&gt;" (instead of "Sub-meter X"), and the total row reads "Total Electricity Charges" (instead of "Electricity Charges for &lt;Month Year&gt;")
- Invalidated all cached electricity bill PDFs so they regenerate with the new labels on next download

### Receipt PDF - Reference Number
- **Reference number now appears on receipts**: fixed a silent save failure where `reference_no` was blocked by RLS on the regular server client; the follow-up UPDATE now uses the admin client (access already validated by `requireBillingAccess`)
- Invalidated all cached receipt PDFs so they regenerate with the reference column on next download

---

## Release v4.11 - Reference Numbers, Dashboard Defaults & UX Fixes (Jul 13, 2026)

### Payment Reference Numbers
- Added a free-text **Reference No** field to the Record Payment dialog (mode-specific placeholder: "UPI transaction ID", "UTR number", etc.; hidden for Razorpay)
- Reference is stored in a new `payments.reference_no` column and displayed below the payment mode in the payments list
- Reference appears on the receipt PDF in the Payment Details table

### Dashboard Improvements
- **Default filter changed to "All Time"** - the dashboard duration filter now defaults to All Time instead of Current Month
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

## Billing & Payments UX - Unit Filter + Breakdown Column (2026-07-15)

### Enhancements

- **Unit filter** added to both the Billing page and Payments page. Appears as a dropdown after the Duration filter when the association has more than one unit. Filters bills and payment rows instantly (client-side, no network call).
- **Stacked breakdown column** replaces the separate Maintenance and Electricity columns in the Billing page. Each bill row now shows non-zero line items stacked vertically with icons (⚡ electricity, 🔧 maintenance, 📄 other charges), making it easier to read at a glance without widening the table.

### Migrations

| File | Description |
|---|---|
| `20260724000000_drop_electricity_reconciliation.sql` | Drops the `electricity_reconciliation` table, which was scaffolded but never implemented or used in the application |

---

## Release v4.12 - Other Charges Multi-Bill, Common Area Electricity Fix & Mobile Responsive (Jul 15, 2026)

### Billing - Other Charges

- **Multiple Other Charges bills per period**: Removed the blanket "already billed" guard for Other Charges. The system now allows generating multiple OTH bills in the same month - each additional run picks up newly added (unbilled) pending charges.
- **Per-charge Due Date**: Added an optional "Due Date" field to the Add Other Charges form. When set, charges with a specific due date are billed separately from the default-due-date batch, allowing e.g. "OTH A and B on July 5, OTH C on July 14" to generate as two distinct bills.
- **Billed flag on pending charges**: Once pending charges are included in a generated bill they are marked `billed = true`. The staged charges list shows a "Billed" badge and hides the trash button for these rows. Unbilled (draft) pending charges remain deletable.
- **Delete guard**: `removePendingOtherChargeAction` now explicitly blocks deletion of already-billed charges server-side.
- **Missing UPDATE RLS policy**: `pending_other_charges` had read/insert/delete policies but no UPDATE policy, so the `billed = true` update during bill generation silently affected 0 rows under RLS. Added an UPDATE policy (+ grant) mirroring the delete policy.
- **Can't re-generate Other Charges in the same month**: Ad-hoc charges now bill as their own OTH bill even when a prior OTH bill exists for the period.
- **Draft display filter**: The billing page now filters the draft staging list to `billed = false`, so generated charges appear only under Generated Bills.

### Electricity - Common Area Bug Fix & PDF Fixes

- **Common Area billing**: CommonArea sub-meters now correctly route consumption to the Common Area unit (not the FK-placeholder unit). Both billing generation and PDF generation detect `meter_type = 'CommonArea'` and `unit.type = 'Common Area'`.
- **Unit bills leaking Common Area row**: The PDF generator now excludes `meter_type = 'CommonArea'` from regular unit sub-meter queries.
- **Address "0"**: Common Area units with `door_no = "0"` no longer render "Common Area, 0, Ground Floor" - the zero is treated as absent.
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
- **Context-aware balance summary**: "All Units" mode shows focused cards - "Units in Advance (N) ₹X CR" and "Units with Dues (N) ₹Y DR" - zero-value cards are hidden; both-zero state shows a "All settled" indicator. Single-unit mode shows a single Advance/Outstanding/Settled chip.
- **Running balance retained** in single-unit view as the rightmost column.
- **UX polish**: row hover states, consistent column padding, dead-code colSpan ternary removed, count badge hidden on single-unit summary card.

### Add Cash Ledger Entry Dialog

- **Paid By and Payer Name hidden for Due entries** - these fields only apply to Advance Payments.
- **Contextual date label**: "Due Date" for Due entries; "Paid On" for Advance Payments.
- **Contextual submit button**: "Record Due" or "Record Payment".
- **Contextual dialog description and notes placeholder** change based on entry type.
- **Form resets on dialog close** (cancel or submit) - prevents stale state on reopen.
- **Amount field** starts empty instead of pre-filling 0.

### Other Charges PDF

- Descriptions no longer append " for [Month Year]" - plain charge name (e.g. "Sinking Fund") shown as-is. Port of main branch fix to cash-ledger-feature branch.

_Last updated: 2026-07-16_

---

## Cash Ledger - UX Overhaul, Data Fixes & Code Quality (2026-07-16)

### Dashboard - Per-Unit Balance Cards

- **Cross-unit aggregation bug fixed**: Advance credit on Unit A no longer cancelled dues on Unit B. Balances are now computed per `(unit_id, bill_type)` independently.
- **Inline per-unit display**: Balance cards render inside each unit's section - dues and credit are shown against the correct unit, never aggregated across units.
- **"Pay now" button**: Styled with brand primary (`bg-primary text-primary-foreground`) instead of hardcoded orange. Links to the Payments page.
- **Color compliance**: All hardcoded colors (`text-emerald-600`, `bg-orange-600`, `border-slate-*`) replaced with semantic Tailwind tokens and CSS variables (`var(--sidebar-foreground)` for brand-gold text tone).

### Cash Ledger Page

- **Server-side prefetch**: Initial entries are fetched in parallel with units on the server. Table renders immediately without a client-side waterfall on load (`useRef` skip pattern for first `useEffect`).
- **Owners/tenants redirected**: `prop_owner` and `tenant` roles are now redirected to the Payments page (their balance is visible there); the Cash Ledger is an admin/operator tool.
- **Split "Paid By" / "Notes" columns**: The combined "Description/Paid By" column is now two separate columns - "Paid By" and "Notes" - eliminating confusion where notes text appeared under "Paid By" for Due entries.
- **Nav cleanup**: Cash Ledger removed from `prop_owner` and `tenant` nav allowlist.

### Payments Page - Cash Ledger Dues Section

- **Dues visible for all roles**: Owners/tenants now see their outstanding Cash Ledger dues in the Payments page via per-unit aggregation (no cross-unit netting).
- **`advance_applied` factored into outstanding**: Bills that had advance auto-applied were incorrectly showing ₹X outstanding alongside "Paid" status. Outstanding now correctly computed as `total_amount − paid_amount − advance_applied` across the query SELECT, type interface, metric totals, and per-row calculation.
- **Adaptive title**: Section shows "Pending dues" for owners/tenants, "Cash ledger dues" for admins.
- **Unit column hidden** for single-unit owners/tenants.
- **Table padding & typography**: Consistent `py-3 pl-4/pr-4` cell padding; outstanding amounts rendered `font-bold tabular-nums text-destructive`.
- **Action label**: Button reads "Record payment" (was "Pay").

### Code Quality & Deduplication

- **`apps/web/lib/bill-type-labels.ts`** (new): Shared `BILL_TYPE_LABELS` map and `billTypeLabel()` helper - extracted from two files where it was duplicated.
- **`apps/web/lib/cash-ledger-aggregation.ts`** (new): Shared `loadUnitLedgerBalances()` - per-unit credit/due aggregation extracted from two files where the algorithm was duplicated. Exports `UnitCashLedgerBalance` and `CashLedgerLineBalance` interfaces.
- Removed dead `AccountBalanceCard` component from `association-dashboard.tsx`.
- Removed `isRestricted` prop from `CashLedgerSection` (concept no longer needed after redirect).
- Removed `Badge` import from `cash-ledger-dues-section.tsx` (replaced with inline `<span>`).

_Last updated: 2026-07-16_

---

## Razorpay Payments + Cash Ledger Integration (2026-07-16)

### Razorpay - Association Gateway Config UI

- **`PaymentGatewayCard`** (new): Association admins can configure their own Razorpay credentials (Key ID, Key Secret, Webhook Secret, active toggle) from the Association Settings page. Key Secret is write-only - never fetched to the client.
- **`upsertPaymentGatewayAction`**: Server action using `getSupabaseServerAdminClient` (bypasses RLS) to insert or update `association_payment_gateways`. Key Secret is only required on first-time insert; updates leave the secret unchanged if the field is left blank.
- **Settings page fix**: All 7 previously-missing fields (`email`, `phone`, `bank_account_name`, `bank_account_number`, `bank_name`, `bank_ifsc`, `bank_branch`) restored to the `AssociationForm` prop after a merge conflict accidentally dropped them.

### Razorpay - Async Webhook Safety Net

- **`POST /api/billing/razorpay/webhook`**: Handles `payment.captured` events. Verifies HMAC-SHA256 signature via the association's `webhook_secret`. Reads `bill_ids`, `association_id`, `paid_by_role` from order `notes`. Calls `record_payment()` via service role (no user session). Fully idempotent - `payments_razorpay_bill_uniq` index prevents duplicate recording if `/verify` already fired.
- **`create-order/route.ts` updated**: Embeds `notes: { bill_ids, association_id, paid_by_role }` in every Razorpay order so the webhook can identify bills without a separate DB lookup.
- **Migration `20260709200000_record_payment_webhook_bypass.sql`**: Makes `recorded_by` nullable on `record_payment()` and grants EXECUTE to `service_role` so the webhook route can record payments without an authenticated session.

### Payments Page - Overdue Bills

- **Overdue filter**: `Overdue` status added to the bill filter in `payments-section.tsx` so overdue bills appear when the Overdue tab is selected.
- **Pay All includes Overdue**: The "Pay All" button now covers `Unpaid | Partial | Overdue` bills (was `Unpaid | Partial` only).
- **Units page badge**: `.eq('status', 'Unpaid')` widened to `.in('status', ['Unpaid', 'Partial', 'Overdue'])` so the unpaid-bills badge on the Units page counts overdue bills too.

### Cash Ledger - Import Date Fix

- **`FALLBACK_DATE` was hardcoded** to `'2026-06-30'` in both `cash-ledger-actions.ts` and `import-cash-ledger-dialog.tsx`. Import rows without a `paid_on` date were silently backdated to June 30. Fixed to `new Date().toISOString().slice(0, 10)` (today's date at import time).

### Migrations

| Migration | Description |
|-----------|-------------|
| `20260709200000_record_payment_webhook_bypass.sql` | Makes `recorded_by` nullable; grants `record_payment()` EXECUTE to `service_role` for webhook use |

_Last updated: 2026-07-16_

---

## Payments Page UX Overhaul + Razorpay Due Payments (2026-07-17)

### Payments Page - Owner/Tenant View

- **Header subtitle**: Changed to "Bills and payment history for your unit(s)." for owner/tenant view.
- **Duration default**: Owners/tenants now default to "FY 2026-27" (this_fy) instead of "All Time" - avoids large data loads and scopes the metric cards meaningfully.
- **Metric cards**: "Collected" renamed to "Paid" and "Outstanding" renamed to "Bills due" for the owner view - language matches the resident's perspective.
- **"Type" column**: New column showing bill type (Electricity, Maintenance, Other Charges) in the bills table.
- **Outstanding column**: Paid rows now show "-" instead of "₹0" to reduce noise.
- **Overdue row highlight**: Overdue bill rows get a subtle red/amber background tint.
- **Pay button**: Changed from outline to filled primary style for stronger affordance.
- **Payment history button**: Shows `👁 1 payment` / `👁 2 payments` ghost button with eye icon; hides when no payments exist.
- **Bill No. column**: Truncated with ellipsis and `title` tooltip for long bill numbers.
- **URL sync**: Clicking a unit tab (Unit 404, Unit A1) now syncs the `?unit=` query param so the view is deep-linkable and survives browser back/forward.

### Pending Dues - Owner Pay Now Button

- **`RazorpayDueCheckoutButton`** (new component): Prop owners can now pay cash-ledger dues directly online via Razorpay, same as bill payments.
- **`POST /api/billing/razorpay/create-order-due`** (new route): Creates a Razorpay order for a ledger due (unit + bill_type + amount). Validates caller owns/rents the unit. Embeds `is_due: 'true'`, `unit_id`, `bill_type` in order notes for the webhook.
- **`POST /api/billing/razorpay/verify-due`** (new route): Synchronous post-payment verification - same HMAC signature check as `/verify`, validates unit ownership, calls `record_due_payment_webhook()` via admin client to immediately record the payment and credit the cash ledger. The async webhook remains as a safety net for network failures.
- **Webhook extended**: `POST /api/billing/razorpay/webhook` now handles `is_due` orders as a fallback by calling `record_due_payment_webhook()`; idempotent via `razorpay_payment_id` unique index.
- **`CashLedgerDuesSection`**: Added `canPay` prop; renders the Pay button for owner/tenant when gateway is active.
- **Pending dues description**: Changed to "Other dues raised by the association." (was too technical for owner view).

### Code Quality

- **Pre-existing TypeScript errors fixed**: `razorpay-checkout.tsx` had a `declare global { interface Window }` augmentation that conflicted with TypeScript's ambient module merging, causing TS2717 + TS2339 errors (hidden by Turborepo cache). Replaced with a local `RazorpayConstructor` type alias and `(window as any)` cast - identical runtime behaviour, no more type errors.

### Migrations

| Migration | Description |
|-----------|-------------|
| `20260717100000_razorpay_due_payment.sql` | Adds `razorpay_payment_id` to `cash_ledger_payments`, extends mode check to include 'Razorpay', grants service_role INSERT on ledger tables, adds `record_due_payment_webhook()` function |

### Paid Dues Visibility

- **Payments page - Dues section**: The "Pending dues" section now shows both outstanding and paid dues together. When any paid history exists, the section title becomes "Dues" and the description updates to "Dues raised by the association and your payment history." New **Status** column (Outstanding badge in red / Paid badge in green) and **Paid on** column (date of payment). Section renders even when all dues are cleared, so payment history is never hidden.
- **Owner Dashboard - My payments widget**: Cash ledger due payments now appear alongside bill receipt payments. Shown as **"Due · {Bill Type}"** with mode and date, clearly distinct from receipt-based entries (no receipt download button). "View all" link threshold correctly counts due payments. Owners can now confirm their due payment immediately from the dashboard without navigating away.

### Statement Page (Owner/Tenant)

New dedicated page at `/statement` for prop owners and tenants - a cash ledger passbook showing all financial activity on their unit(s).

**Features:**
- **Per-unit tabs** for owners with multiple units (e.g. Unit 404 / Unit A1) - isolated balances, no cross-unit mixing
- **Summary cards**: Closing balance (neutral "All settled" when ₹0, green = credit, red = due), Total credits, Total debits - updates live with filters
- **Bank passbook table**: Date · Description · Debit · Credit · Balance columns; newest first; running balance on every row; consistent `text-sm` font across all columns
- **Opening balance row**: When filtering by FY, shown only when non-zero - shows balance carried forward from prior periods
- **FY filter**: Defaults to current financial year; all historical FYs in dropdown; displays "FY 2026-27" not raw key
- **Bill type filter**: Maintenance / Electricity / Water / etc.; displays human-readable labels
- **Human-readable descriptions** from `entry_type`: "Maintenance due raised", "Advance deposited - Maintenance", "Due payment for Maintenance"
- **Payment mode sub-line**: For due_payment entries, shows "Paid via Razorpay" (Razorpay ref stripped from display; full ref still stored in `cash_ledger_payments`)
- **Card title**: "Ledger activity" with transaction count in description; no redundant unit name in card header
- **Navigation**: "Statement" nav item added for prop_owner and tenant roles only (admins use the full Cash Ledger page)

### Owner/Tenant Dashboard - Instant Unit Filter

- **Unit pill filter** added to the Owner Dashboard and Tenant Dashboard: "All units" + one pill per unit. Default is "All units" showing all units stacked with unit headers and dividers.
- **Instant switching** - unit filtering is now entirely client-side. All data is fetched once on server load; pill clicks trigger a local `useState` update with zero network round-trips. Eliminates the 300–800ms server re-render that occurred with the previous URL-param approach.
- **Architecture**: Per-unit rendering logic extracted from the server component into a new `OwnerUnitsView` client component (`owner-units-view.tsx`). Server component now purely fetches and passes serialised data as props.

### Migrations

| File | Description |
|---|---|
| `20260717110000_clean_razorpay_notes.sql` | Updates `record_due_payment_webhook` to store `'Paid via Razorpay'` in `cash_ledger.notes` instead of the raw payment ID (ID already stored in `cash_ledger_payments.razorpay_payment_id`) |

### Admin Dashboard - Instant Duration Filter

- **Duration switching is now instant** - all 7 duration periods (Current Month, Last Month, 3 Months, 6 Months, This FY, Last FY, All Time) are prefetched in parallel at page load. Switching between periods requires zero network round-trips.
- **Architecture**: New `AdminOverviewPanel` client component (`admin-overview-panel.tsx`) accepts `metricsByDuration: Record<string, OverviewMetrics>` and manages active duration with `useState`. Server component fetches static data (units, mescom, audit log) + 7 parallel bill queries in a single `Promise.all`, then passes the complete result to the client component. The inline admin render JSX and the `DashboardDurationSelect` URL-navigation approach have been removed from the server component.
- **No regression**: URL param `?d=` is still accepted for deep-linking; the client component uses it as `initialDuration`.

### Razorpay Payment Flow - Performance & UX Overhaul

**"Preparing..." eliminated (eager order pre-creation):**
Both `RazorpayCheckoutButton` and `RazorpayDueCheckoutButton` now pre-create the Razorpay order on component mount in the background. By the time the user clicks Pay, the order is already ready - the Razorpay modal opens in under 200ms with no visible "Preparing..." state.

**"Verifying..." eliminated (optimistic UI):**
After the user completes payment in the Razorpay modal, the button resets and a success toast appears immediately. The `/verify` (or `/verify-due`) API call runs in the background fire-and-forget. The async webhook is the safety net. Users no longer wait 6–8 seconds staring at a spinner.

**API route parallelization:**
All 4 Razorpay API routes (`create-order`, `create-order-due`, `verify`, `verify-due`) were refactored to fire DB queries in parallel using `Promise.all`. Sequential round-trips reduced from 5–6 to 2 batches. `record_payment` RPC calls for multi-bill Pay All are now also parallel.

**Admin dashboard - recent activity errors filtered:**
The recent activity widget now excludes audit log entries whose action or summary indicate errors (`%failed%`, `%error%`, `Failed%`). Failed Razorpay webhook recording attempts no longer pollute the feed.

### Statement Page - UX Improvements

- **Charge names instead of "Other Charges"**: Bill line item descriptions are now fetched alongside bills. For `other_charges` bill type, the actual charge name(s) (e.g. "Water Charges, Parking Fee") are surfaced in the description column, replacing the generic "Other Charges" label. GST/tax line items are excluded from the name.
- **Payment subtext clarified**: For bill payments, the subtext now shows `TPC/26-27/OTH/000069 · Paid via Razorpay` - bill number and mode together. For cash ledger due payments, shows `Paid via Razorpay · Applied to outstanding balance`.
- **Page description fixed**: "chronological order" changed to "Most recent transactions first."
- **Pay CTA on closing balance**: When balance is negative (amount due), a red "Pay now →" link appears inline, navigating directly to the Payments page.
- **Dynamic credits sub-label**: Shows "Payments received", "Advance deposits", or "Advances & payments" based on what credit types are actually present in the filtered view.
- **Date group headers**: Shaded header rows group same-date transactions - reduces visual noise and makes scanning faster.

_Last updated: 2026-07-18_

---

## Payment Gateway Security - Write-Once Credentials (2026-07-17)

### Security hardening: Razorpay gateway config is now write-once

The association payment gateway panel has been redesigned to eliminate an in-place credential edit attack surface. Previously, an association admin (or an attacker who compromised an admin account) could silently swap the Razorpay Key ID to redirect all payments to a different Razorpay account without re-entering the secret.

**What changed:**

- **Create-only form** - the gateway setup form is shown only when no gateway exists. All three fields (Key ID, Key Secret, Webhook Secret) are required at creation time; there is no partial-save path.
- **Read-only configured view** - once saved, credentials are displayed as masked values only (`rzp_live_••••••••XXXX` for Key ID, bullet placeholders for secrets). No field is editable.
- **Pause/resume toggle** - admins can still enable or disable online payments inline without touching credentials. This is the only in-place mutation allowed.
- **Delete to rotate** - to change credentials, the admin must explicitly delete the gateway (with a confirmation dialog) and then re-create it. This makes credential rotation a deliberate, auditable act.
- **Security notice on create form** - a contextual warning on the create form tells the admin that credentials cannot be viewed or edited after saving.

This pattern mirrors industry-standard API key UX (GitHub tokens, Stripe keys, AWS access keys).

_Last updated: 2026-07-18_

---

## Payment Gateway - Removed from Super Admin Panel (2026-07-18)

### Product decision: association admin is the sole owner of payment credentials

The super admin panel previously had full write access to Razorpay credentials (create, toggle, delete) for any association. This created split ownership, audit ambiguity, and a platform liability - the platform operator could silently write credentials tied to an association's bank account.

**What changed:**

- **Super admin panel** - payment gateway section **removed entirely**. The super admin has no business viewing or acting on association-level payment credentials.
- **Association admin** - sole owner of their gateway (create / toggle / delete from Settings → Association → Payment Gateway).
- **Super admin server actions** - `adminCreatePaymentGatewayAction`, `adminTogglePaymentGatewayAction`, and `adminDeletePaymentGatewayAction` removed. The gateway query is removed from the admin account page data fetch.
- **`AdminPaymentGatewayCard` component** - deleted.

**Why:** A read-only status card in the admin panel gives the operator nothing actionable - if a customer needs help, support directs them to their own settings. The section added noise without signal. Removing it keeps the admin panel focused on platform-level concerns only.

_Last updated: 2026-07-18_

---

## Statement Page - Rebuilt from Bills + Payments (2026-07-18)

### Root cause fixed: Razorpay payments were invisible on the Statement page

The Statement page previously read exclusively from the `cash_ledger` table. Only the due-payment webhook (`record_due_payment_webhook`) wrote to that table - regular Razorpay payments recorded via `record_payment()` wrote to the `payments` table only. As a result, any payment made through the Razorpay checkout (including "Pay All") was absent from the Statement even though it showed correctly on the Payments page.

**What changed:**

- **Statement data source** - rebuilt from `bills` (debit entries) + `payments` (credit entries) as authoritative sources. `cash_ledger` is still queried but only for advance deposits and advance-applied entries, which have no equivalent in the bills/payments tables.
- **All payment paths now appear** - Cash, UPI, Razorpay, webhook - any payment recorded against a bill shows on the Statement automatically, regardless of how it was captured.
- **Richer entry descriptions** - dues show the bill number as a sub-line; payments show the payment mode ("Paid via Razorpay", "Paid via Cash", etc.).
- **Copy cleanup** - "Ledger activity" renamed to "Transaction history"; "No ledger activity for this period" → "No transactions for this period."
- **No DB migration required** - purely a query and presentation change.

_Last updated: 2026-07-18_

---

## Cash Ledger - Performance Fix (2026-07-18)

### Root causes

The Cash Ledger page was slow to load because:

1. **Full-table initial fetch** - the server prefetch queried all entries for the association with no date filter, returning potentially thousands of rows before the page could render.
2. **Extra auth round-trip on every filter change** - `getCashLedgerEntriesAction` called `getAssociationRole()` (a DB query) before the data query on every client-side filter change.
3. **Missing DB index** - the `cash_ledger` table had no index on `(association_id, entry_date)`, causing Postgres to scan the full table.

### What changed

- **Default to current financial year** - the initial page load now scopes the prefetch to the current FY (Apr 1 – Mar 31). The filter toolbar pre-populates with these dates so the client state matches the server-rendered data. Users can clear the dates to view all-time history.
- **Direct Supabase query on page load** - replaced the `getCashLedgerEntriesAction` call in the page server component with an inline query. Authentication is already proven by `requireRole`; calling the Server Action re-ran `getAssociationRole` (an unnecessary DB round-trip).
- **New DB index** (`20260717192130_cash_ledger_perf_index.sql`) - composite index on `cash_ledger(association_id, entry_date DESC, created_at DESC)` so all filtered queries use an index scan instead of a seq scan.

**Net effect:** Initial page load is noticeably faster (fewer rows fetched + index scan); filter changes are also faster (auth re-check eliminated).

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260717192130_cash_ledger_perf_index.sql` | Composite index on `cash_ledger(association_id, entry_date DESC, created_at DESC)` |

_Last updated: 2026-07-18_

---

## Statement Page - UX Overhaul (2026-07-18)

A comprehensive UX pass on the Statement page (`/statement`) addressing visual hierarchy, information density, and usability.

### Visual hierarchy

- **Closing balance card** is now full-width on mobile (`col-span-2`) and uses a colored left border (red when amount is due, green when credit available) to immediately draw the eye.
- Balance number bumped to `text-3xl` (vs. `text-2xl` on the other two cards); "Amount due / Credit available" label now matches the balance color for immediate clarity.
- Total Credits and Total Debits sit side-by-side below the closing balance on mobile - secondary info after the headline number.

### Pay CTA

- "Pay now" button changed from **red (destructive)** to **amber** - a call-to-action, not an alarm.

### Transaction table

- **Removed the empty DATE column** - date group headers already show the date; the redundant column and header are gone. Table is now 4 columns (Description, Debit, Credit, Balance).
- **Transaction type badges** added to each row: color-coded chips (`Due` red, `Payment` green, `Advance` blue, `Applied` purple, `Reversal` orange) for instant visual scanning without reading text.
- **Bill number subtext** made lighter (`text-muted-foreground/60`, `text-[11px]`) - visible when needed, invisible at a glance.
- **Period totals footer row** added at the bottom of the table: Debit total, Credit total, and closing balance in a muted summary row.

### Filters

- **URL-synced filters** - FY, bill_type, and unit selection are reflected in the URL via `window.history.replaceState` (no server re-render). Bookmarking a filtered view preserves the selection; the server passes initial values via `searchParams` props.
- **FY dropdown with transaction counts** - non-current FYs show ` · N` count to hint at older history volume.
- **"Other Charges" filter shows actual charge names** - the filter option for `other_charges` now shows real line-item descriptions (e.g. "Water Charges, Parking Fee") matching what users see in the table.
- Card header description now shows the active period label (e.g. `FY 2026-27 · 14 transactions`).

### Copy fix

- Total Debits sub-label changed from "Dues & applied advances" → **"Bills raised this period"**.

---

## Razorpay Payment Reversals / Refunds (2026-07-18)

### Problem

When a Razorpay payment was reversed or refunded (e.g. a test charge reversal from the Razorpay dashboard), the UI showed no indication - the bill remained marked as Paid, the cash-ledger due stayed settled, and the statement showed no reversal entry.

### What changed

**Database (`20260718000001_payment_reversal.sql`)**

- `payments.status` column added (`active` | `reversed`, default `active`)
- `payments.reversed_at` column added (timestamp, nullable)
- `cash_ledger_payments.status` and `cash_ledger_payments.reversed_at` added with the same semantics
- `sync_bill_payment_status` trigger updated to only sum `active` payments - reversing a payment now automatically reverts the bill to Unpaid / Partial
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
| `20260725000001_partial_refund.sql` | Adds `refunded_amount` to both tables; updates trigger to use `amount - refunded_amount`; extends `record_payment_reversal()` to accept a partial amount |

## Razorpay Partial Refunds (2026-07-22)

Extended the reversal model to correctly handle Razorpay partial refunds.

**Problem:** The original implementation always fully reversed a payment (setting `status='reversed'`), regardless of how much Razorpay actually refunded. A ₹300 partial refund on a ₹1000 payment would incorrectly mark the entire ₹1000 as reversed and revert the bill to Unpaid.

**What changed**

- `payments.refunded_amount` and `cash_ledger_payments.refunded_amount` columns added (default 0)
- `sync_bill_payment_status` trigger now sums `amount - refunded_amount` for active payments, so a partially refunded payment contributes only its net paid amount
- `record_payment_reversal(payment_id, refund_amount)` - new optional `refund_amount` parameter:
  - Partial refund: increments `refunded_amount`; bill status recomputes to Partial
  - Full refund (amount ≥ remaining): marks `status='reversed'`; bill reverts to Unpaid
  - Repeated partial refund calls accumulate until total reaches full amount
- Webhook now passes `refundEntity.amount / 100` (paise → rupees) to the function
- Statement page: partially refunded payments show an orange **Partial refund · ₹X** badge; balance reflects the net paid amount (original − refunded)

_Last updated: 2026-07-22_

---

## Advance Credit - Retroactive Application & Payment Correctness (2026-07-18)

### Root cause fixed: advances stranded while bills stayed overdue

Advances were only ever applied to a bill **at generation time** (inside `create_bill_with_items`). An advance deposited *after* a bill was generated sat idle as credit while that bill stayed Unpaid/Overdue. Real symptom: a unit holding a ₹10,000 advance was still shown ₹7,000 overdue and prompted to "Pay All", because nothing re-applied the later advance to the already-generated bills.

**What changed:**

- **Retroactive advance application** - new `apply_available_advance()` (guarded, admin/billing-operator only) + internal worker `_apply_advance_internal()` apply a unit's available advance to its outstanding bills of the **same bill-type, oldest-first**, writing the same `advance_applied` ledger debit + bill status update as the generation-time path. Called whenever an advance is deposited (manual **Add Entry** and **CSV import**).
- **Scoped backfill (verification-first)** - the migration's backfill is deliberately limited to the `sandbox-residency-test` association so it could be verified safely on the shared remote DB before touching real data. Verified on Unit 111: the ₹10,000 Other-Charges advance was applied to bills `OTH/000008` (₹5,000) and `OTH/000009` (₹500) → both **Paid**, ₹4,500 credit remaining; the ₹1,500 Maintenance bill correctly stays due. The full all-association backfill will follow in a separate migration.
- **Net-first overdue** - because applied advances flow into `bills.advance_applied`, the existing `recompute_overdue_bills()` (which already excludes advance-covered bills) no longer flags a bill as Overdue when advance credit covers it.
- **"Pay All" double-charge bug fixed** - the payable-bills computation subtracted only `paid_amount`, ignoring `advance_applied`; it now subtracts both, so advance-covered amounts are never re-charged.
- **Copy fix** - advance-credit hint changed from "Auto-applied to your next bill" to "Automatically applied to your bills of the same type" to reflect the actual (now retroactive, bill-type-scoped) behavior.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260718050936_apply_advance_to_outstanding_bills.sql` | Adds `_apply_advance_internal()` + guarded `apply_available_advance()`; backfills existing advances against outstanding bills (oldest-first, per bill-type) |
| `20260718052826_backfill_advance_all_associations.sql` | Full all-association advance backfill (idempotent - zero-balance assocs are no-ops) |

---

## Migration Ordering Fix (2026-07-18)

**Problem:** `20260723000000_cash_ledger.sql` has a later timestamp than several migrations that `ALTER` or reference `cash_ledger`/`cash_ledger_payments` (e.g. `20260717100000`, `20260717110000`, `20260718000001`). On a fresh `supabase db reset`, migrations replay in filename order, so those ALTER statements fail because the tables don't exist yet. Remote was unaffected (migrations were applied in historical order, not replayed from scratch).

**Fix:**
- New bootstrap migration `20260716100000_cash_ledger_bootstrap.sql` creates both tables with `CREATE TABLE IF NOT EXISTS` at a timestamp before all dependent migrations.
- `20260723000000_cash_ledger.sql` updated to use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` so it becomes a safe no-op when the bootstrap has already run (fresh reset), while remaining the canonical source of policies and functions.
- When pushed to remote, only the bootstrap migration runs (as a no-op `IF NOT EXISTS`) - the remote DB and its migration history are not disrupted.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260716100000_cash_ledger_bootstrap.sql` | Bootstrap: creates `cash_ledger` + `cash_ledger_payments` with `IF NOT EXISTS` to fix `db reset` replay order |

---

## UX & Performance Fixes (2026-07-18)

### Add Unit - Performance
- `logAuditEvent` is now fire-and-forget (`void`) in `createUnitAction`. Audit logging no longer blocks the server action response, cutting perceived latency by one full DB round-trip.

### Cash Ledger - Paid By Race Condition
- Fixed a stale-fetch race condition in the "Add Cash Ledger Entry" dialog. Rapid unit switching could cause an older in-flight fetch to overwrite the result from a newer one, hiding the owner in the "Paid By" dropdown. An `ignore` flag with effect cleanup now discards stale responses.
- The Owner and Tenant `SelectItem` options now remain rendered while members are loading (when `paid_by_type` already matches that role), preventing Radix from losing the selected value during the loading state.

### Cash Ledger - Import Dialog Layout
- Import preview table widened (`max-w-2xl` → `max-w-3xl`) and given `min-w-max` so all 7 columns render at their natural width.
- Added `overflow-x-auto` to the table wrapper so content scrolls horizontally instead of clipping.

### Navigation - Statement Hidden from Assoc Admin
- "Statement" nav item removed from the `assoc_admin` sidebar; it is now exclusive to `prop_owner` and `tenant` roles.

### Dashboard - Advance Credit / Pending Dues Type Visibility
- Advance Credit and Pending Dues cards now always show the per-type breakdown, even when there is only a single bill type. Previously, a single-type advance (e.g. ₹3,000 for "Other Charges") showed no type label - owners had no context for what the credit applied to.

_Last updated: 2026-07-18_

---

## Mobile Responsiveness - Cash Ledger & Navigation (2026-07-19)

### Sidebar - Hamburger Now Visible on Mobile
- Changed the mobile sidebar toggle from `variant="ghost"` (invisible at rest on white/cream topbar) to `variant="outline"` with an explicit border, making it clearly identifiable as a tappable button.

### Cash Ledger - Filter Bar Mobile Layout
- Unit and Bill Type selects now use `w-full` on mobile, snapping to fixed widths on `sm+`.
- Date range wrapper changed to `flex-wrap` so FROM / TO inputs break to a new line on narrow screens instead of pushing the Clear button off-screen.
- Import CSV and Add Entry buttons now stretch to fill the full row width on mobile (`flex-1`) and revert to auto-width on larger screens.

### Cash Ledger - Table Horizontal Scroll on Mobile
- Added `min-w-max` to the ledger table so it expands to its natural content width. Previously `w-full` constrained the table to the container and the `overflow-x-auto` wrapper had nothing to scroll, causing columns to be cut off.

_Last updated: 2026-07-19_

---

## Error Handling & Logging Improvements (2026-07-22)

### Core: sanitizeActionError utility
- New `apps/web/lib/errors/sanitize-action-error.ts` utility routes all server-side DB errors through a two-audience pattern: logs the raw error (with Postgres error code, action context, and a ref code) via `getLogger()`, and returns a plain user-safe message to the client.
- Ref codes (MMDD-HHMM format) are included in unrecoverable error messages so support can correlate a user report to a specific log entry.
- Errors are classified by Postgres code (`23505` = conflict, `42725` = ambiguous function, `PGRST116`/`23503` = not found) and message patterns (permission keywords), with a `server` fallback for everything else.

### Bug fix: "Record Payment" - raw Postgres error shown to user
- Recorded a payment failing with a raw Postgres `42725` (ambiguous function) error visible to the user.
- Root cause: migration `20260724000001` created a 7-arg `record_due_payment` with `p_receipt_no` defaulting to null; migration `20260724000002` created the correct 6-arg version but only revoked permissions on the 7-arg instead of dropping it - both overloads coexisted.
- Fix: new migration `20260725000000_drop_record_due_payment_7arg.sql` drops the ambiguous 7-arg overload, leaving only the 6-arg version.
- UX: pay-due-dialog now shows errors inline (destructive Alert inside the form) instead of a toast that dismissed while the dialog stayed open.

### Bug fix: "Remove Member" - assoc_admin incorrectly denied
- Association admins were getting "Sorry, we couldn't remove the selected member" even when they had legitimate access.
- Root cause: server action logic was inconsistent with the permissions loader - when no `assoc_admin_permissions` rows were configured for an association, the loader allowed (no restriction), but the action denied (no row = deny).
- Fix: action now fetches all permission rows first; if none exist it falls through to hierarchy-based access (allow); if rows exist it checks the specific role's `can_delete` flag.

### Error messages - user language across all action files
- All permission denial messages rewritten from technical ("Not authorized.", "Only an association admin or billing operator can do that.") to plain user language ("You don't have the required permission. Contact your association admin.").
- All raw `error.message` leaks eliminated from: `cash-ledger-actions.ts`, `payments-actions.ts`, `units-actions.ts`, `electricity-actions.ts`, `update-association.ts`.
- Permission denials now emit `logger.warn()` with action context before returning, creating a full server-side audit trail.

### Error surfaces standardised
- Dialog flows (pay-due-dialog) now use inline `<Alert variant="destructive">` for errors so the user sees the message without the dialog closing.
- Non-blocking list/table actions continue to use `toast.error`.

### Import dialog row error messages
- Rewrote all `_error` strings across 4 import dialogs (units, cash ledger, sub-meters, meter readings) from technical column-name format (`unit_no is required`) to imperative user-facing format (`Unit number is missing - add it and re-upload.`).
- Added `.catch()` handler to `parseSpreadsheetFile` in the units import dialog - corrupt or unsupported files now show a toast instead of silently failing.
- Standardised error-row highlight colour in cash-ledger import dialog to `bg-destructive/5` (was hardcoded `bg-red-50 dark:bg-red-950`).

---

## Email Templates - Ooruda Brand Redesign (Jul 21, 2026)

### Changes

- **Shared components** (`wrapper`, `header`, `content`, `footer`, `heading`, `cta-button`, `body-style`): Full redesign with Ooruda brand - amber `#FCD469` header bar with "ooruda" wordmark + "Property Management" tagline, white content card, amber CTA button, minimal footer with copyright and `hello@ooruda.com`
- **OTP email**: New layout with amber code box (large monospace OTP, amber background), Ooruda-branded subject ("Your Ooruda sign-in code"), clear expiry note, and security disclaimer
- **Invite email**: Updated subject, heading, copy, and CTA ("Accept Invitation") with Ooruda branding; plain-text link fallback preserved
- **Account delete email**: Updated all copy to Ooruda voice and tone
- **All locale files** (`otp-email.json`, `invite-email.json`, `account-delete-email.json`): Rewrote copy - action-first subjects, friendly tone, Ooruda-specific wording

### Migrations Changelog

_No new migrations in this release._

_Last updated: 2026-07-22_

---

## v1.2 - Super Admin Polish, Units UX & Sinking Fund (2026-07-21)

### Super Admin Panel - Association-Centric Language

- **Accounts page defaults to Associations tab** - previously defaulted to "All"; now opens on the Associations tab directly.
- **Tab switching performance** - `useTransition` keeps current content visible during navigation; `router.prefetch` on mount pre-warms RSC payloads for all three tabs. Active tab stays enabled while sibling tabs are disabled during the transition. A progress bar appears below the filter row while switching.
- **Terminology cleanup** - "Team Members" → "Members", "Team Accounts" → "Associations", "Delete Team Account" → "Delete Association" throughout the super admin UI.
- **Subscriptions removed** - `SubscriptionsTable` and all subscription references removed from the super admin panel (not applicable to Ooruda).
- **Open Workspace button** - promoted to primary button with an `ExternalLink` icon; label shortened to "Open Workspace".
- **Test badge on Associations** - associations marked `is_test = true` now display an amber "Test" badge in the admin table (previously only personal accounts had test badges).

### Units Page

- **Status column moved** - Status badge now appears immediately after Area (before Owner), improving scannability.
- **Filter chips simplified** - removed the non-functional "Ground Floor" and "Overdue" filter chips; active filter set is now: All · Occupied · Self Occupied · Rented · Vacant.

### Sinking Fund - New Bill Type

A new `sinking_fund` bill type (`SNK/` prefix) has been introduced. It behaves like Other Charges - ad-hoc, admin-staged, no frequency schedule - allowing associations to collect sinking fund contributions on any cadence (monthly, quarterly, annual) with the description field for period context (e.g. "Q1 Apr–Jun 2026").

**Where it appears:**
- **Cash Ledger** - Bill Type dropdown includes "Sinking Fund" for both Due and Advance Payment entries.
- **Billing** - "Sinking Fund" button in the header opens a staging dialog (mirrors Other Charges dialog). Staged charges appear in the Draft Bills tab under a dedicated Sinking Fund section. "Generate Bills" dialog and Bill Type filter both include Sinking Fund.
- **Payments** - Bill Type filter includes Sinking Fund.
- **Bills filter** - Generated Bills type filter includes Sinking Fund.
- **Receipts / Statements** - `bill_type_labels` and `bill_filter_items` updated; Sinking Fund appears wherever bill type is shown.

**Generation logic** - `billing-actions.ts` fetches `pending_sinking_fund_charges` for the period, builds SNK line items per unit, generates `SNK/` bills, then marks all staged charges as billed. Due date is sourced from the staged charge's `due_date` field (falls back to the Other Charges due date).

### Migration

| Migration | Description |
|---|---|
| `20260721000001_sinking_fund.sql` | Adds `sinking_fund` charge type to `seed_builtin_charge_types()`, backfills all existing associations, creates `pending_sinking_fund_charges` table with full RLS |
| `20260721000002_fix_sinking_fund_rls.sql` | Replaces incorrect RLS policies (wrong UUID comparison) with correct `association_role()` pattern - matches `pending_other_charges` policies |
| `20260721000003_reports_collection_summary.sql` | Adds `get_collection_summary(association_id, from_period, to_period)` DB function for efficient aggregated reporting without full table scans |
| `20260721000004_fix_collection_summary_types.sql` | Recreates `get_collection_summary` with explicit `::text` casts on `bills.period` (varchar(7)) and `bills.bill_type` (varchar(20)) to fix "structure of query does not match function result type" error caused by plan-cache staleness after subsequent migrations altered the bills table |

### Sinking Fund - Critical Bug Fixes

- **Separate `sinkingCreated` counter** - previously the mark-as-billed guard used the same `created` counter as maintenance bills; if any maintenance bills were generated (setting `created > 0`) but no SNK bills were generated (e.g. `hasSinking` caused a skip), staged sinking fund charges would be incorrectly marked as billed with no corresponding bill. Fixed by introducing a separate `sinkingCreated` counter.
- **Period format validation** - `addSinkingFundChargeToUnitAction` and `bulkAddSinkingFundChargeAction` now validate that the `period` field matches `YYYY-MM` format before processing.

---

## Reports Screen - Polish & Bug Fixes (2026-07-21)

### Performance - Zero Server Round-Trips on Filter/Tab Change

- **Root cause of filter lag identified**: `router.push()` for filter changes triggered a full Next.js RSC re-render - `page.tsx` re-executed on the server (`requireRole` + association lookup = 2 remote DB calls) before the client could begin fetching data.
- **Fix: `window.history.replaceState` + React state**: All filter state (`preset`, `from`, `to`, `activeTab`) now lives in `useState` inside `ReportsClientPage`. Filter and tab changes call `setState` + `window.history.replaceState()` - URL stays in sync for bookmarking/refresh without triggering any Next.js navigation. Zero server round-trips.
- **Tab changes also fixed**: `ReportsTabs` now receives `activeTab` + `onTabChange` as props. No `router.push` for tab switching.
- **Abort-controller pattern**: Stale in-flight requests are cancelled when a new filter is applied, preventing race conditions.
- **Loading skeleton**: Pulsing KPI + chart skeleton shown during data fetch.
- **Pre-existing lint fixes**: Removed unused `FormDescription` import in `phone-otp-sign-in-container.tsx`; refactored `admin-accounts-table.tsx` prefetch effect to use `useCallback` with correct deps.

### Collection Tab - Data Model Fix

- **Root cause fixed**: The Collection tab previously queried `bills.period` for the date range - so "This FY" (Apr 2026–Mar 2027) returned empty if no bills were raised in that period, even though payments had been received against old bills.
- **Now payment-date-based by default**: Collection tab defaults to "Payments Received" view - data grouped by `paid_at` month (actual cash received in the selected period), matching what the dashboard shows.
- **"Bills Raised" toggle**: Secondary toggle still lets admins see bills issued in the period and their collection rate.
- **Empty state** correctly distinguishes "no payments in period" from "no bills raised in period".

### Export UI Redesign

- Replaced the broken wrapping menu with a clean icon + two-line layout per option.
- Green `FileSpreadsheet` icon for CSV, blue `FileText` icon for PDF.
- Section label ("Download report") and separator added for clarity.
- `min-w-[220px]` on dropdown ensures it never collapses.
- Export button shows abbreviated label on mobile (`sm:hidden`/`sm:inline`).

### Custom Date Range - Full Day Precision

- Replaced `<input type="month">` (month/year only) with `<input type="date">` - admins can now pick exact dates like "10 May 2026 – 20 Jun 2026".
- `from`/`to` are now full `YYYY-MM-DD` dates throughout the system (previously `YYYY-MM`).
- DB queries adapt automatically: period-based tables (`bills.period`, `mescom_bills.period`) receive `YYYY-MM` via `date.slice(0,7)`; payments receive exact dates for full precision.
- `<input max>` / `<input min>` constraints prevent selecting an invalid range in the picker itself.
- Live preview below each input shows formatted date ("10 May 2026") for confirmation.
- "Range: X – Y" summary shown before applying so admins can confirm the selection.
- Custom button label after applying shows the exact human-readable range (e.g., "10 May – 20 Jun 2026").
- Popover re-syncs to current range whenever reopened.
- `resolvePreset()` now returns `YYYY-MM-DD` dates (e.g., `last_fy` → `2025-04-01` to `2026-03-31`).

### Responsiveness

- Tab bar (`Collection | Outstanding | Payments | Electricity`) is now `overflow-x-auto` + `w-max` on mobile - all 4 tabs are horizontally scrollable without wrapping.
- Tab row and Export button stack vertically on mobile (`flex-col sm:flex-row`).
- Default preset changed to "Last 6 months" (was "This FY") so the screen almost always shows data on first load.

### All Time Filter

- Added **All Time** as a new preset (appears first in the pill row) - queries return every record with no date bounds.
- **All Time is now the default** when the Reports screen is opened fresh (no URL params).
- When All Time is active, period/date filters are omitted from all four DB queries (bills, payments, mescom_bills, `get_collection_summary`) so no records are excluded.
- URL is kept clean: `from`/`to` params are removed when switching to All Time; only `preset=all_time` is stored.
- Opening the Custom Range popover while on All Time pre-fills dates to last 6 months as a sensible starting point.
- Hydration-safe: `from`/`to` URL params are optional - absence is handled gracefully on SSR.

---

## Performance - Bill Generation, PDF Downloads & CSV Imports (2026-07-21)

### Bill Generation
- **Unit loop parallelised**: The `generateBills` action now processes units in concurrent batches of 8 instead of serially. For a 100-unit association, this reduces bill-generation wall-clock time by ~60–70% (e.g. 3 bill types × 100 units went from 300 sequential RPCs to ~13 batches of parallel calls). Bill-type RPCs within each unit were already parallel; units are now parallel too.

### PDF Downloads (Bills & Receipts - all types)
- **Pre-render at generation time**: After `generateBillsAction` creates bills, it immediately schedules background PDF rendering for all bills that don't yet have a cached PDF. Uses Next.js `after()` so the action returns to the user without waiting; Vercel keeps the lambda alive to complete the renders. Result: first download is a cache hit (~0.8–1.4s) instead of a cold render (7–8s). Batches of 3 concurrent renders to avoid saturating the CPU.
- **Auth bypassed for pre-render**: `getOrGenerateBillPdf` now accepts `{ skipAuth: true }` for server-side generation flows, eliminating the 4-sequential-DB-call `getAssociationRole` chain (~400ms) per bill. The skip is internal-only and not exposed to any route handler.
- **Storage write correctness fix**: Receipt PDF storage upload is now awaited (was previously a fire-and-forget `void` IIFE that could be killed by serverless before completing, leaving `receipts.pdf_url` as NULL). Bill PDF upload was also corrected for the same reason.
- **Storage + audit parallelised**: The `bills.update` and `logAuditEvent` writes after upload now run concurrently instead of sequentially.
- **Electricity bill DB parallelised**: The three sequential DB calls (mescom bill → sub-meters → billing entity) are now issued in a single `Promise.all`. Only the meter-readings fetch (which needs the mescom bill ID) remains sequential. Saves 2 round-trips per electricity PDF.
- **Non-electricity bills**: `resolveBillingEntity` now resolves in the else branch only (not wasted on electricity bills). Same for receipts.
- Font registration was already guarded with a `registered` flag; no redundant work.

### CSV/XLSX Imports
- **Units import**: Replaced the O(n) row-by-row fallback on unique-key conflict with a single pre-flight query that identifies existing unit numbers. Only truly new units are bulk-inserted; conflicts are reported directly without serial DB calls.
- **Meter readings import**: Three independent pre-flight queries (units, mescom bills, generated-bill count) are now fetched in a single `Promise.all`. Sub-meters and last-readings fetches follow sequentially (they depend on the units result), cutting total round-trips from 5 sequential to 3 sequential steps.
- **Cash ledger import**: The `apply_available_advance` RPC calls (one per unique unit + bill-type bucket) now run concurrently via `Promise.all` instead of serially. An import touching 10 unit/bill-type combos previously made 10 sequential RPCs; now they fire in one parallel wave.
- **Bulk invite members (Units → Invite Members)**: Rewrote `bulkInviteMembersAction` from a fully serial loop to a three-phase parallel pipeline. Previously: 100 rows × ~800ms per `createUser` Auth call = **~80 seconds**. Now:
  - **Phase 1** - Synchronous validation (phone normalisation, association lookup, role check) with no DB calls. Invalid rows are collected instantly.
  - **Phase 2** - Unique new-user creation in **parallel batches of 8**. Phones are deduplicated so two rows sharing a phone (e.g. RENTED unit owner + tenant) only fire one `createUser` call. 100 new users now takes ~13 batches × ~800ms = **~10 seconds** (8× faster).
  - **Phase 3** - All `accounts_memberships` inserts fire concurrently in a single `Promise.all` wave.
  - Unit-level updates (status, owner, tenancy) and audit logs were already parallelised; unchanged.

## Reports Screen Redesign (2026-07-21)

Complete overhaul of the Reports screen for admins - replaced the old table-heavy layout with a chart-first, visually rich analytics dashboard.

### Overview

- **4 tabbed views**: Collection Overview · Outstanding Dues · Payments · Electricity
- **Date range picker**: Preset buttons (This FY, Last FY, 6m, 3m) + custom month/year range popover; state driven by URL `searchParams` so tab switches preserve the selected range
- **Dual export**: "Export" dropdown → Download CSV (current tab) or Download PDF (full report)
- **Property owner view** unchanged - still shows personal dues only

### Collection Overview Tab

- 4 KPI tiles: Total Billed, Total Collected, Outstanding, Collection Rate %
- Grouped bar chart: Billed vs Collected per month, colour-coded by bill type
- Donut pie: Bill-type breakdown, clickable to filter the bar chart
- Line chart: Collection rate % trend with 100% reference dashed line

### Outstanding Dues Tab

- 3 KPI tiles: Total Outstanding, Overdue Bills count, Oldest Unpaid date
- Horizontal bar chart: Ageing buckets (Current / 1–7d / 8–30d / 30d+)
- Horizontal bar chart: Top-10 defaulters by unit (highest outstanding)
- Expandable table: All outstanding bills with unit/bill-number search, paginated 25/page

### Payments Tab

- 4 KPI tiles: Total Collected, Transaction count, Avg Payment, Top Mode
- Area chart: Payment timeline with gradient fill (weekly if range > 60 days, else daily)
- Donut pie: Payment mode mix (UPI / Cash / NEFT / etc.)
- Stacked bar chart: Payments by bill type per month (only shown if 2+ bill types present)
- Paginated payment log table

### Electricity Tab

- 3 KPI tiles: Total Cost, Total Block Units, Avg Rate / kWh
- Composed chart: Bar for invoice amount + Line for block units on dual Y-axes
- Period selector dropdown for per-unit consumption view
- Detail table: MESCOM bill data per period

### PDF Report Export

Full management-level PDF via `@react-pdf/renderer`:
- Association header (logo, name, address, GSTIN)
- 4 sections: Collection Summary table, Outstanding Dues table, Payments Received table, Electricity Summary table
- KPI boxes per section, alternating-row tables
- Fixed footer: "Generated on [date] by [user]" + "Page X of Y"

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260721000003_reports_collection_summary.sql` | `get_collection_summary()` function for aggregated collection data |
| `20260725000000_drop_record_due_payment_7arg.sql` | Drops the ambiguous 7-arg `record_due_payment` overload left by `20260724000001`, resolving the Postgres `42725` error when recording payments |

_Last updated: 2026-07-23_

---

## v1.2 - Billing & Payments UX Fixes (2026-07-23)

### Billing Overview

- **Overdue count now correct** - KPI tiles and "Collection by Period" table were showing 0 overdue even when bills were past due. Root cause: the filter checked `b.status === 'Unpaid'` but the DB stores `status = 'Overdue'` for past-due bills after the nightly recompute. Fixed by using `displayBillStatus(b) === 'Overdue'` everywhere, matching what the Payments page has always shown.
- **"Fully Paid" tile is now interactive** - was a plain non-interactive `<div>`; now wrapped in a `TileButton` that filters the period table to fully-collected periods.
- **"Outstanding" tile filter** - now hides periods with zero outstanding (not just re-sorts); instantly shows which periods need attention.
- **Cursor pointer on tiles** - added `cursor-pointer` to `TileButton`; browsers don't auto-apply it to `<button>` elements without explicit CSS.
- **Removed "All bill types" period filter** - a per-bill-type filter on an aggregate period table was unintuitive. Full type/unit/status filtering is available in the period drill-down (Layer 2).
- **KPI tile visual consistency** - replaced custom `KpiTile` sub-component with the shared `MetricCard` primitive; both the overview and period detail now use identical tile styling.
- **"Collection by Period" heading size** - bumped from `text-sm` to `text-base font-semibold`.
- **Tile filter performance** - `setActiveTile` now runs in `startTransition()`.

### Bills Section

- **"View Drafts" button now works** - `useState(props.defaultOpen)` only initialises on mount; soft navigation doesn't remount the component. Fixed with `useSearchParams` + `useEffect` that syncs `open` and `activeTab` when `?bills=` URL param changes.
- **Controlled Tabs** - converted from uncontrolled (`defaultValue`) to controlled (`value`/`onValueChange`) so tab state stays in sync with URL-driven opens.
- **Toggle UI** - replaced inline "↓ Show bill list / ↑ Hide" text button with a clean chevron icon on the section title.

### MultiSelect - Accessibility

- **Nested interactive element fixed** - clear button moved outside the PopoverTrigger into an absolutely-positioned sibling.
- **Focus ring, ARIA roles** - `focus-visible:ring-1` on clear button; `role="listbox" aria-multiselectable="true"` on options container; `aria-haspopup="listbox"` on trigger.

### Date Parsing

- **Timezone-safe due date display** - `new Date('YYYY-MM-DD')` parses as UTC midnight, shifting displayed date by one day for IST users. Fixed with `.replace(/-/g, '/')` in `billing-period-detail.tsx` and `billing-unit-sheet.tsx`.

### Payments Page

- **"Record Payment" button** - changed from primary to `variant="outline"` so it doesn't dominate table rows visually.
- **Table typography** - period/type are `text-sm text-muted-foreground`; unit `font-medium`; total `font-medium`; outstanding uses dark-mode-safe `text-red-600 dark:text-red-400`.
- **Overdue row highlight** - now uses semantic `bg-destructive/[0.04]`.
- **Metrics strip** - label font normalised to `text-[11px]`; value weight `font-semibold`.

_Last updated: 2026-07-23_

---

## v1.2 - Security & Correctness Hardening (2026-07-23)

Adversarial bug-hunt across the entire v1.2 branch. 22 confirmed findings resolved (7 high, 9 medium, 6 low). No user-facing feature changes.

### Critical / High - Security Fixes

- **[FINANCIAL] verify-due amount not HMAC-verified** - `/api/billing/razorpay/verify-due` accepted client-supplied `amount` after HMAC verification, allowing a payer to capture a small payment then claim the full outstanding. Fixed: the route now fetches the actual captured amount from the Razorpay API (`GET /v1/payments/{id}`) server-side and uses that instead of the body value.
- **[AUTHZ] Webhook isDue: unit_id not validated against association** - a caller with Razorpay credentials for Association A could supply a foreign `unit_id` (from Association B) in order notes and credit that association's cash-ledger. Fixed: unit ownership is now verified against `association_id` after HMAC verification.
- **[INFODISCL] Webhook refund.processed: payment-ID oracle** - unauthenticated callers could distinguish valid from invalid Razorpay payment IDs by comparing HTTP responses (400 vs 200) on HMAC failure. Fixed: all HMAC failures in the refund branch now return 200.
- **[FINANCIAL] recordDuePaymentAction: no outstanding cap** - billing operators could record payments exceeding actual outstanding, inflating ledger credits. Fixed: action now fetches balance via `get_cash_ledger_balance` RPC and rejects amounts > outstanding.
- **[SSRF] PDF logo URL fetched server-side without validation** - association admins control `picture_url`; react-pdf fetches it during PDF render. Pointing to `169.254.169.254` or internal services = SSRF. Fixed: `sanitizeLogoUrl()` helper now validates HTTPS and blocks all private/reserved IP ranges before passing to the renderer.
- **[BIZLOGIC] bill_type casing inconsistency strands advance credit** - `addCashLedgerEntryAction` stored bill_type as-is; `bulkImportCashLedgerAction` lowercased. The `apply_available_advance` RPC uses case-sensitive equality, so credits from one path never matched the other. Fixed: `addCashLedgerEntryAction` now applies `.trim().toLowerCase()`.

### Medium - Logic & Authorization Fixes

- **PDF dedup Map auth race** - concurrent requests for the same `billId` shared an in-flight Promise before auth was checked, potentially bypassing `canAccessUnit`. Fixed: auth pre-check now runs before consulting the dedup map in both `getOrGenerateBillPdf` and `getOrGenerateReceiptPdf`.
- **getCashLedgerEntriesAction weak role check** - any association member (prop_owner, tenant) could call the server action and read the full association cash ledger. Fixed: upgraded to `requireBillingAccess` (assoc_admin / billing_operator only).
- **Reports allTime guard broken** - when only one date bound was empty, `!from && !to` was false but the bound was null, causing `.gte('period', null)` to filter out all rows. Fixed: each bound is now applied individually with `if (fromPeriod) / if (toPeriod_)` guards.
- **paidByRole from webhook notes not enum-validated** - arbitrary role strings could be stored in payment records. Fixed: validated against `['Owner', 'Tenant']`, defaulting to `'Owner'`.
- **bulkAddOtherChargeAction split_mode not runtime-validated** - zod schema validated on client only; direct calls could pass arbitrary strings. Fixed: added `if (input.split_mode !== 'flat' && ...'per_sqft')` guard.
- **Invalid date strings in payments tab reports** - unvalidated date strings passed to `paid_at` filter could cause opaque DB errors. Fixed: ISO date regex guard `(/^\d{4}-\d{2}-\d{2}$/)` applied before filter.
- **PDF render errors re-threw and poisoned shared Promises** - concurrent waiters on the same dedup Promise would all reject if render failed. Fixed: render catch blocks now `return null` instead of `throw`.

### Migrations

| Migration | Purpose |
|-----------|---------|
| `20260727000000_cash_ledger_payments_idempotency.sql` | Unique partial index on `cash_ledger_payments(razorpay_payment_id)` - prevents double-credit on concurrent/retry payment recording |

_Last updated: 2026-07-23_

---

## v1.2 - Bulk Export: Bills & Payments (2026-07-23)

Full bulk-export capability for the Billing and Payments screens, supporting both CSV (client-side, instant) and PDF (server-rendered, formatted report).

### Features

- **Export Menu** (`components/export-menu.tsx`) - Split-button dropdown on both screens. Shows count of currently-filtered rows. CSV downloads instantly; PDF is fetched from a server route with a toast progress indicator. Warns at 200+ rows; blocks at 300+.
- **Bills CSV export** (`lib/export-csv.ts`) - RFC 4180-compliant CSV with raw number values for spreadsheet compatibility. Exports all filtered bills from client state (no server round-trip).
- **Payments CSV export** - Flattens nested payments; bills with zero payments get one empty row.
- **Bills PDF export** (`/api/billing/bills/export/pdf`) - POST endpoint accepting an array of bill IDs. Fetches via RLS-enforced client (only authorized bills returned). A4 landscape PDF with KPI summary, proportional-flex table, alternating rows, and totals footer.
- **Payments PDF export** (`/api/billing/payments/export/pdf`) - Same pattern; flattens one row per payment server-side.
- **PDF templates** (`packages/pdf-templates`) - `BillsExportDocument` and `PaymentsExportDocument`. A4 landscape, 9 columns, `<View overflow:'hidden'>` cell wrappers to prevent column bleed, `BILL_TYPE_LABELS` and `PAYMENT_MODE_LABELS` for human-readable values.
- **SSRF guard** (`lib/server/sanitize-logo-url.ts`) - Extracted shared helper; blocks private/reserved IP ranges before react-pdf fetches the association logo.

### PDF Quality Fixes (2026-07-23)

Column bleed identified after initial test export: text from narrow columns overflowing into adjacent cells, causing headers to visually merge (e.g. "AdvanceReference"). Root cause: `overflow:'hidden'` on `<Text>` nodes is unreliable in react-pdf - only `<View>` clips correctly. All table cells refactored to `<C flex={n}>` View wrappers. Also added `razorpay` to `PAYMENT_MODE_LABELS`.

### No new migrations

---

## v1.2 - Units, Billing & Cash Ledger UX + Feature Flag (2026-07-27)

### Changes

- **Units table - Door No column**: Added a "Door No" column to the units list view, displayed between Unit and Type. Shows `-` when not set.
- **Cash ledger unit dropdown**: Removed the "Unit " prefix from dropdown items and card title - now shows bare unit numbers (e.g., `101` instead of `Unit 101`). "All Units" label unchanged.
- **Billing view - removed Paid & Status columns**: The "Paid" amount and "Status" (Paid/Unpaid/Partial/Overdue) columns have been removed from the billing table. These are payment-layer concepts, not billing-layer - they belong in the Payments view. The billing view now focuses on invoice data (Bill No, Unit, Breakdown, Total). Status filtering and summary tiles remain unaffected.
- **Cash Ledger feature flag**: Cash Ledger is now an optional per-association feature. Super admins can enable/disable it from the Association Settings page under a new "Workspace Features" card. When disabled: the nav item is hidden for all roles, and direct URL access redirects to the dashboard. Defaults to enabled for all existing associations.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260727000001_cash_ledger_feature_flag.sql` | Adds `cash_ledger_enabled boolean NOT NULL DEFAULT true` to `associations` table |

_Last updated: 2026-07-27_

---

## v1.2 - Owner/Tenant View Polish: Dashboard & Statement (2026-07-27)

### Changes

- **Dashboard - Amount Due color coding**: The total outstanding amount on the owner/tenant dashboard is now color-coded: green (₹0 / fully paid), red (overdue), amber (unpaid but not yet overdue).
- **Dashboard - Advance Credit tile**: The advance credit section is fully themed in green (border, background, text) to visually distinguish credits from dues.
- **Dashboard - Side-by-side tiles**: Pending Dues and Advance Credit tiles are now displayed in a 2-column grid on `md+` screens and stacked on mobile, giving equal visual weight to both.
- **Payments - Paid dues removed**: Paid cash ledger dues are no longer shown on the Payments page. Paid history belongs in the Statement; the Dues section on Payments now shows only outstanding items.
- **Statement - Date column**: Added a dedicated "Date" column as the first column in the Statement transaction table. Rows are sorted newest-first by default; clicking the Date header toggles ascending/descending. The previous date-group separator rows have been removed - each row is now fully self-contained (bank-statement style).
- **Statement - Receipt number**: Cash ledger due payments now show their receipt number in the Statement subtext (e.g., "Paid via Cash · Receipt: CL-MAINT-abc123-R1"). The `record_due_payment` DB function now embeds the auto-generated receipt number into the `cash_ledger` entry notes so it flows through to the Statement without a cross-table join.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260727000002_due_payment_receipt_in_notes.sql` | Updates `record_due_payment` function to embed `receipt_no` in `cash_ledger.notes` for Statement visibility |

_Last updated: 2026-07-27_


---

## v1.2 - Statement Page: Comprehensive UX & Correctness Fixes (2026-07-27)

### Changes

- **Balance column - no + prefix, ₹0 neutral**: Removed the misleading `+` prefix from all balance cells. Color alone conveys direction (green = credit, red = owing, muted = zero). Matches standard bank-statement convention.
- **Opening balance row placement**: Now appears at the bottom of the table when sorted newest-first (default), and at the top when sorted oldest-first - always anchors the chronological start of the period.
- **"Maintain dur" raw text bug fixed**: `due` entries no longer display raw `notes` as subtext (truncated system strings). Only a structured `bill_no` is shown for due entries.
- **Sort icon shows direction**: Date column sort button now shows ↓ when newest-first and ↑ when oldest-first, replacing the static ↕ icon.
- **Year shown when needed**: Date cells include the year when FY filter is "All time" or entries span multiple calendar years.
- **Export CSV**: "Export" button added to the transaction history card header. Downloads the current filtered view as a CSV with metadata header (unit, period, opening balance).
- **Advance payment subtext**: `advance_payment` entries now show their `notes` as subtext (e.g. "via NEFT · Ref: TXN123").
- **Date column min-width**: Explicit `w-[72px] min-w-[72px]` prevents date column from collapsing on narrow screens.
- **Mobile responsive columns**: Debit and Credit columns collapse into a single color-coded "Amount" column on screens < 640px. Desktop keeps the split view.

### Migrations Changelog

_No new migrations - all changes are frontend only._

_Last updated: 2026-07-27_

---

## v1.2 - Payments Page: Owner/Tenant View Redesign (2026-07-27)

### Changes

- **Unified "What you owe" section**: Bills and cash ledger dues are merged into a single list sorted by urgency - overdue items first (most overdue at top), then upcoming bills by due date, then cash ledger dues with no date. Owners no longer need to understand two separate billing systems.
- **Total outstanding hero**: A prominent card at the top shows the combined amount owed across all bills and cash ledger dues, with urgency-aware color coding (red = overdue, amber = pending, green = all clear) and a plain-English sub-label ("3 overdue · oldest 17 days past due").
- **Pay All bills button**: When a Razorpay gateway is active, a "Pay all bills" button appears in the hero card, triggering payment across all outstanding bills in a single checkout.
- **Per-item Pay buttons**: Each outstanding row has its own Pay button - Razorpay checkout for bills, Razorpay due checkout for cash ledger items.
- **Recent payments section**: Replaces the full bills table for owners. Shows the 5 most recent bill payments (bill type, period, date, mode, receipt number) with a "Full statement →" link to the Statement page for full history.
- **Admin/operator view unchanged**: The full PaymentsSection (bills table with filters, record payment, void) and CashLedgerDuesSection remain exactly as-is for admins and billing operators.
- **Filters removed from owner view**: Duration and status filters were admin tools surfaced incorrectly to owners. The new view shows only what matters: outstanding items and recent history.

### Migrations Changelog

_No new migrations - all changes are frontend only._

_Last updated: 2026-07-27_

---

## v1.2 - Owner/Tenant View: Comprehensive UX & Logic Fixes (2026-07-28)

### Changes

**Dashboard (owner-units-view)**
- **Total amount due now includes cash ledger dues**: Previously the hero only counted outstanding bill amounts. It now adds cash ledger dues (e.g. Electricity cash charge) so the total matches the Payments page.
- **Accurate sub-label**: The hero sub-label now distinguishes bills and cash charges ("2 bills · 1 cash charge") instead of only counting bills.
- **Cash charges breakdown in hero**: When cash dues exist, a "Cash charges" row appears in the period breakdown within the hero card, matching the Payments page's breakdown.
- **"Pay now · ₹X" button with amount**: The action button now shows the exact total, and the redundant "Pay by bill" button (which navigated to the same URL) has been removed.
- **Bill history shows bill type**: Bill type label (e.g. "Maintenance", "Sinking Fund") now appears as the primary label in Bill History rows; the bill number is shown as muted secondary text.
- **"My payments" - cash ledger entries now show receipt number**: Due payment entries now extract the receipt number from notes and display it. Label changed from "Due · {type}" to just the type name with receipt prefix.
- **"My payments" → "Full statement" link**: Changed from "View all" (which went to Payments) to "Full statement" (which correctly links to the Statement page).
- **Advance credit description updated**: Changed from "Automatically applied..." to "Will be auto-applied to your future bills of the same type" - clearer about future-only application.
- **`bill_type` added to dashboard bill query**: `bills` select now includes `bill_type` so bill type labels can be displayed.

**Payments page (owner-payments-view)**
- **"Balance due" badge renamed to "Cash charge"**: Clearer distinction between regular bill dues and cash ledger charges.
- **"Pay all bills" shows exact amount**: Button label now includes the payable bills total ("Pay all bills · ₹1,200") to prevent confusion with the combined ₹6,200 total.
- **Disclaimer when cash dues present**: A note below the "Pay all bills" button explains that it covers bills only and cash charges are paid separately from the list below.
- **Recent payments now includes cash ledger payments**: Previously only showed bill payments. Now fetches and merges cash ledger payment history (`cash_ledger_payments`) - up to 10 entries, merged with bill payments and sorted newest-first. Cash ledger entries show bill type, "Cash charge" label, mode, and receipt number from notes.
- **"Full statement →" link moved to card header**: The statement link now appears in the top-right of the Recent payments card header instead of below the fold at the bottom of the page.
- **Hero card tint increased**: Background opacity increased slightly (50%→60% light, 20%→30% dark) for more visible urgency signal.
- **Hero AlertCircle icon bumped to h-6 w-6**: Slightly larger to anchor the urgency card visually.

**Statement page (statement-table)**
- **Default sort changed to oldest-first**: The transaction list now defaults to chronological order (oldest at top), making the running balance progression natural and readable. Users can still toggle to newest-first.
- **Closing balance card renamed to "Ledger balance"**: Previously labeled "Amount due / Credit available / All settled" - now correctly labeled "Ledger balance due / Credit balance / Ledger balanced" to distinguish it from the Payments page's actionable total.
- **Cross-type advance disclaimer**: When advance deposits are present, a note appears on the closing balance card: "Advance credits are type-restricted - e.g. a Maintenance advance cannot offset Electricity dues. See Payments for your exact payable amount."
- **Always-visible Payments link**: The "Go to Payments →" button now appears on the closing balance card regardless of balance state (not just when owing), since the Statement's aggregate balance may differ from the actionable amount due.
- **Credits breakdown**: When both advances and payments are present, the Total Credits card now shows a sub-breakdown of "Payments: ₹X · Advances: ₹Y" so users understand the composition.

**Super admin Accounts table**
- **Overflow fix for desktop and mobile**: Added `overflow-x-auto` to the table wrapper and `min-w-0` to the outer container, preventing the accounts table from bleeding past the viewport edge.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260727000003_advance_application_receipts.sql` | New `advance_application_receipts` table (association_id, unit_id, cash_ledger_id, bill_id, bill_type, amount, voucher_no, applied_at, pdf_url); RLS: `SELECT` for authenticated members; storage path for cached advance application PDFs |

## v1.2 - Owner/Tenant View: Bug Fixes & UX Polish Round 2 (2026-07-28)

Second pass of fixes following a critical analysis of the updated screenshots.

**Dashboard (owner-units-view)**
- **Fixed: ₹5,000 Electricity shown twice** - Removed the "Cash charges" breakdown row from the hero card. The hero total (₹6,200) and sub-label ("1 bill · 1 cash charge") sufficiently communicate the combined due; the Pending Dues card below carries the detail. Eliminates user confusion about double-counting.
- **Fixed: Duplicate "Pay now" buttons** - Removed the redundant "Pay now" button from the Pending Dues card. The hero CTA ("Pay now · ₹X") is the single primary action. Pending Dues card now shows the amount and breakdown only, without a competing action.
- **Fixed: Floating "Overdue" badge removed** - The status badge that floated in the top-right corner of the hero card (disconnected from the amount) has been removed. The period breakdown rows already label overdue periods inline - the badge was redundant and visually confusing.

**Payments page (payments/page.tsx + owner-payments-view)**
- **Fixed: Cash ledger payment history completely broken across Dashboard and Payments** - Two compounding bugs: (1) query was selecting `unit_no`, which does not exist on `cash_ledger_payments`; (2) query was selecting `notes`, which also does not exist - the column is `receipt_no`. Both caused Supabase to return `null` for the entire result set, silently hiding all cash ledger payment entries everywhere. Fixed by selecting only valid columns (`id, unit_id, bill_type, amount, mode, paid_at, receipt_no`), making `unit_no` optional in the type, and replacing the regex-based notes extraction with direct `dp.receipt_no` access. Applied consistently across `association-dashboard.tsx`, `payments/page.tsx`, `owner-units-view.tsx`, and `owner-payments-view.tsx`.
- **Fixed: Hero card ₹6,200 vs ₹1,200 contradiction** - "Total outstanding ₹6,200" with a "Pay all bills · ₹1,200" button created a confusing 5× gap. Implemented Option B: when both bills and cash dues are present, the hero card now shows the ₹6,200 total and splits the breakdown into two inline panels - "Bills ₹1,200 [Pay · ₹1,200]" and "Cash charges ₹5,000 [Pay individually below ↓]". The total is self-explaining: the two panels add up to it exactly. When only bills are present (no cash dues), falls back to the original single "Pay all bills · ₹X" button.

**Statement page (statement-table)**
- **Fixed: Balance column - CR/DR indicator added** - The running balance cell now shows a small "CR" or "DR" suffix (e.g. "₹2,350 CR") so colour-blind users and printed exports can distinguish credit balance from debit balance. Applied to both transaction rows and the opening balance row.
- **Improved: "Amount owed per ledger" sub-label** - Changed from "Ledger balance due" (awkward phrasing) to "Amount owed per ledger" when balance is negative. Zero state changed from "Ledger balanced" to "Ledger settled" for slightly clearer language.
- **Improved: Advance disclaimer moved before Payments button** - When advance credits are present and the balance is negative, the type-restriction disclaimer now appears immediately below the sub-label (before the "Payments →" button), so users read the context before clicking. The disclaimer is also now only shown when the balance is negative (the case where it's most impactful).

### Migrations Changelog

_No new migrations - all changes are frontend only._

_Last updated: 2026-07-28_

## v1.2 - Receipt Downloads: PDF Fix & UX Polish (2026-07-28)

Three issues with the cash-ledger payment receipt download flow were resolved.

### Bug fix: Cash-ledger receipt PDF returned 404

`/api/billing/cash-ledger-payments/[id]/pdf` was querying `cash_ledger_payments` using the admin (`service_role`) Supabase client. The migration for that table explicitly revokes all access from `service_role`, so the admin query always returned no rows and the route returned 404. Fixed by switching to the regular authenticated client, which has `GRANT SELECT` and passes through the `clp_read` RLS policy (`is_association_member`). Authorization is maintained via an explicit membership + unit-ownership/tenancy check.

Additional hardening added: DB query errors now return 500 (not a silent 404), a missing membership row returns 403 rather than silently downgrading to non-admin, `referenceNo` falls back to `'-'` instead of an em-dash (which is outside the Noto Sans subset and would render blank), and PDF render errors are logged server-side.

### Bug fix: Dashboard "My payments" - download icon appeared before amount

In `owner-units-view.tsx`, the `DownloadPdfButton` for due payments was rendered before the amount text. Fixed to match the bill-payment row layout: amount first, then the download icon.

### UX: Payments page - added visible receipt download buttons

The prior implementation placed tiny 12×12 px `<a>` icons inside payment description sub-text, invisible in practice. Replaced with `DownloadPdfButton` components in a dedicated rightmost column for both bill and due-payment rows.

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260728000001_webhook_receipt_no.sql` | Updates `record_due_payment_webhook` to generate and store `receipt_no` (using `_allocate_ledger_doc_no`) - superseded and expanded by `20260728000002` |

_Last updated: 2026-07-28_

## v1.2 - Cash Ledger: Human-Readable Bill Numbering & PDF Context (2026-07-28)

### Feature: Unified bill number format for cash ledger documents

Cash ledger due payment receipts and advance application vouchers now use exactly the same format as regular bills. The document type is conveyed by the PDF title and content, not the number.

| Document | Old format | New format |
|---|---|---|
| Due payment receipt | `CL-MAIN-A1B2C3-R1` | `PRM/26-27/MNT/000001` |
| Advance application | `ADV-MAIN-A1B2C3-A1` | `PRM/26-27/MNT/000001` |

Format: `{INITIALS}/{FY}/{TYPE}/{NNNNNN}` - identical to `allocate_bill_no` output. CL and ADV draw from separate counters in a new `cash_ledger_sequences` table, so bill numbering is unaffected.

### Feature: Cash ledger receipt PDFs show payment type context

- "Invoice Number" replaced with "Payment Type" (e.g. "Cash Ledger Dues Payment - Maintenance") - no invoice is raised for CL payments
- Context note added below the payment table explaining the transaction nature

### Fix: Advance application voucher shows readable category name

Description row now shows "Advance credit - Maintenance" instead of "Advance credit - MNT".

### Migrations Changelog

| Migration | Description |
|---|---|
| `20260728000002_cash_ledger_bill_numbering.sql` | `cash_ledger_sequences` table; `_allocate_ledger_doc_no()` helper; updated `record_due_payment`, `record_due_payment_webhook`, `_apply_advance_internal` |

_Last updated: 2026-07-28_

---

## v1.2 - Critical Bug Fixes: Code Review Pass (2026-07-28)

Four critical bugs and several minor issues identified and resolved following a comprehensive multi-perspective code review of all uncommitted changes.

### Bug fixes

- **Advance application PDF always returned 404**: `getOrGenerateAdvanceApplicationPdf` used the admin (`service_role`) client for the full-data fetch from `advance_application_receipts`. That table has `REVOKE ALL FROM service_role`, so the query silently returned null and every advance voucher download failed. Fixed by switching the table query to `authClient` (the user is already authorized by `canAccessUnit` at that point). Admin client is retained only for storage signed-URL and upload operations.
- **CSV export order was always inverted**: `toCsv` in `statement-table.tsx` called `.reverse()` unconditionally on the `rows` array, which is already in the user's chosen sort order. This made the exported file always the opposite of what the screen showed. Removed the `.reverse()` call.
- **Unit column blank for cash due payments in multi-unit view**: The `cash_ledger_payments` query in `payments/page.tsx` did not join `units(unit_no)`, so `unit_no` was always `undefined`. Multi-unit owners saw blank unit cells for cash due payment rows in "Recent payments". Fixed by adding the join and mapping the result.
- **Status column removed from admin bills view**: A prior cleanup accidentally removed the "Status" column from the Generated Bills table in `bills-section.tsx`. Admins rely on this to distinguish Paid / Partial / Overdue / Unpaid at a glance. Restored with color-coded badges.

### Minor fixes

- **Feature flag defaults to visible**: `layout.tsx` changed from `!assocFlags?.cash_ledger_enabled` to `assocFlags?.cash_ledger_enabled === false` so the Cash Ledger nav item is hidden only when explicitly disabled, not when the flag row doesn't exist yet.
- **Cash receipt PDF reference number**: `referenceNo` fallback changed from `'-'` to `null` so the PDF template renders a proper em-dash for cash payments with no reference number.

### Migrations Changelog

_No new migrations - all changes are code only._

_Last updated: 2026-07-28_

---

## v1.2 - billTypeLabel Consolidation & Statement Receipt Downloads (2026-07-28)

### Fix: Single source of truth for bill type labels

`billTypeLabel` was defined in two separate places with different key formats: `apps/web/lib/bill-type-labels.ts` used lowercase full names (`maintenance`, `electricity`, `sinking_fund`) and `packages/pdf-templates/src/lib/bill-type-labels.ts` used uppercase short codes (`MNT`, `ELT`, `SNK`). Both conventions exist in the DB: bills/cash_ledger use lowercase, bill_sequences uses uppercase. The package version has been merged to cover both by adding lowercase entries. All six web app import sites now import from `@kit/pdf-templates`; the local `lib/bill-type-labels.ts` file has been deleted.

### Feature: Receipt download link on Statement for cash ledger due payments

`due_payment` entries on the Statement page now show a "Download receipt" link, consistent with `advance_applied` entries which already had a link. A new API route `/api/billing/cash-ledger-payments/by-receipt?receipt_no=<value>` was added to look up a cash ledger payment by its `receipt_no` (extracted from the ledger notes field where it's stored as `Receipt: PRM/26-27/MNT/000001`). The route reuses the same auth logic as the existing `[id]` route - authenticated client only, explicit membership + unit-ownership check.

### Migrations Changelog

_No new migrations - all changes are code only._

_Last updated: 2026-07-28_

---

## v1.2 - Reports: Full Revamp (Admin-Only, Filters, Cash Ledger Tab, Exports) (2026-07-29)

Complete overhaul of the Reports feature - from a basic chart screen to a production-grade analytics dashboard. Reports are now restricted to association admins only, with contextual filters, per-tab lazy loading, and filter-aware exports.

### Access control

- **Admin-only**: Reports are now restricted to `assoc_admin` and `billing_operator` roles via `requireRole()`. The previous `prop_owner` path (MyDuesCard, own-data view) has been removed entirely. Owners and tenants do not see Reports in the navigation.

### Filter infrastructure

A new per-tab filter bar has been added above tab content:

- **Unit filter** - searchable multi-select dropdown; shows only units belonging to the association (fetched server-side)
- **Bill type filter** - multi-select across all 6 bill types (maintenance, electricity, sinking fund, other charges, DG usage, water)
- **Outstanding status** - radio buttons: All / Overdue / Partial / Unpaid (Outstanding tab only)
- **Payment mode** - single-select: UPI, NEFT, RTGS, Cash, Cheque, Razorpay, NetBanking (Payments tab only)
- **Active filter chips** - removable badges showing active unit/bill-type selections below the filter bar
- **Clear all** - one-click reset of all filters
- **URL sync** - all active filters are serialized to URL search params (`units`, `types`, `status`, `mode`) for bookmarkable, shareable report views
- **Contextual display** - each tab only shows the filters relevant to it (e.g., Electricity tab shows no filters)

### Per-tab lazy loading

Each tab's data is fetched only when that tab is first activated. A `TabData` cache ensures subsequent tab switches do not re-fetch. Smart invalidation: changing `outstandingStatus` applies client-side (no re-fetch); changing units, bill types, or payment mode re-fetches only the tabs that use those dimensions.

### New: Cash Ledger tab (5th tab)

A new Cash Ledger analytics tab added alongside Collection, Outstanding, Payments, and Electricity:

- **KPI tiles**: Total Credits, Total Debits, Net Movement, Total Entries
- **Monthly cash flow chart**: AreaChart showing credits (green) vs. debits (amber) by month
- **Credits by charge type**: Horizontal progress bars breaking down credit inflows by bill type
- **Full transaction table**: Date, Unit, Entry Type, Bill Type, Paid By, Direction (↑ CR / ↓ DR), Amount, Notes

### Payments tab: unified view

The Payments tab now merges both payment sources:
- **Online payments** (`payments` table) - Razorpay-initiated
- **Cash/NEFT/Cheque payments** (`cash_ledger_payments` table) - manually entered

A Source badge column distinguishes "Cash" (manual) from "Online" (Razorpay) entries.

### Export improvements

- **Filter-aware CSV/PDF**: All exports respect the active unit, bill type, status, and mode filters
- **"Export (filtered)"** label when any filter is active; plain "Export" otherwise
- **Payments CSV**: Now queries both `payments` and `cash_ledger_payments` (previously cash payments were invisible in exports)
- **Cash Ledger CSV**: New export for the Cash Ledger tab
- **Outstanding PDF**: Bill limit raised from 50 to 200; unit and bill type filters applied before generation
- **dg_usage / water** now appear correctly in all chart labels and exports

### Bug fixes

- **`BILL_TYPE_LABELS` duplication removed**: Both Reports files were maintaining a local copy of bill type labels; all now import `billTypeLabel` from `@kit/pdf-templates`
- **Outstanding `.neq('status', 'Reversed')`** applied consistently across all outstanding queries
- **`dg_usage` and `water`** added to `BILL_TYPE_COLORS` for correct chart coloring

### Migrations Changelog

_No new migrations - all changes are code only._

_Last updated: 2026-07-29_

---

## v1.2 - Billing: Unit-Centric Revamp (2026-07-29)

The Billing screen has been rebuilt around the **unit**, not the bill. Previously the Generated Bills table was a flat list that grew as *Units × Periods × Charge Types* - an association with 30 units, 12 months, and 4 charge types produced 1,440 rows to scroll and filter through. Admins think in units ("what does 101 owe?"), so the unit is now the row, and everything else unfolds inside it.

### New: Bills by Unit table

A 3-level progressive-disclosure table. **The row count always equals the unit count** - 30 units means 30 rows, every time, regardless of how many bills exist.

**Level 1 - Unit row** (always visible)
- Colored status dot: green (all paid) / amber (partial) / red (overdue) / grey (no bills)
- Columns: Unit no + floor, Owner name, Last billed period + type count, Outstanding, Overdue, Status badge
- Advance credit shown as a blue badge next to the owner name when the unit is carrying a cash-ledger credit
- Units with no bills still get a row, with a "No Bills" badge and an explanatory message on expand

**Level 2 - Period row** (e.g. "July 2026")
- Collection % progress bar (green at 100%, amber below)
- Outstanding and total billed for that period
- Bill type count

**Level 3 - Bill type row** (e.g. "Maintenance")
- Bill number in mono, amount-derived status badge, total, outstanding/paid
- Days-past-due shown in red for overdue bills
- Per-bill PDF download button

**Level 4 - Bill detail panel** (inline, no modal)
- Line item breakdown with sqft/rate, GST badges, and payer
- GST and advance-applied lines, with a warning when line items and total don't reconcile
- Full payment history: date, mode, reference no, receipt no, with reversed payments struck through and badged

### Unbilled drafts, per unit

Pending Other Charges and Sinking Fund items now surface as a **"Pending" pseudo-period** pinned above the real billing periods inside each unit - you see what's staged for a unit right where you're looking at that unit, rather than in a separate flat tab.

### Search, filter, and navigation

- **Search** by unit number or owner name (instant, client-side)
- **Filter pills**: All Units / Outstanding / Overdue / All Paid, each showing a live count
- **Expand all / Collapse all** for the current page
- **Pagination** at 25 units per page
- **Deep linking**: `?unit=101` auto-expands that unit and its newest period; `?filter=overdue` pre-applies a filter. Filter state syncs to the URL via `replaceState` (no navigation, no scroll loss).
- **Keyboard accessible**: every row is a real button with `aria-expanded`; Enter/Space toggles

### Performance

- The `bill_line_items` join was removed from the initial page payload. The unit → period → type tree is built entirely from data the server already sends, so **expanding and collapsing never hits the network**.
- Line items and payment history are fetched on demand when a bill row is expanded, then cached for the session - collapsing and re-expanding is instant.
- Owner names resolve through a single batched `profiles` query.
- Per-unit advance balances come from one `cash_ledger` aggregate rather than ~180 `get_cash_ledger_balance()` RPC round trips.

### Correctness

- **Void/reversed bills** are excluded from all outstanding, overdue, and collection totals, and rendered struck-through with a Void badge rather than silently dropped
- Status is **derived from amounts**, not the stored DB status, via the existing `displayBillStatus()` - a bill marked Paid with an outstanding balance reclassifies correctly
- Collection % guards against divide-by-zero on fully-waived periods

### What was kept

All existing actions are unchanged and still available: Generate Bills, Add Other Charges, Sinking Fund, CSV/PDF bulk export, and the super-admin Delete All Bills danger zone. The previous Bills section remains below the new table (collapsed by default) so no existing workflow is lost.

### Migrations Changelog

_No new migrations - all changes are code only._

_Last updated: 2026-07-29_

---

## v1.2 - Billing: Unit Table Enhancements & Bulk PDF Export (2026-07-29)

### Bulk PDF export (ZIP)

Admins can now select one or more units in the billing table and download all their bills as a ZIP archive of individual PDFs.

- **Checkbox column** added to the unit table - each unit row has a checkbox; the column header has a "select all on page" checkbox with indeterminate state.
- **Export PDFs (N) button** appears in the toolbar when any units are selected; shows a spinner while the export is in progress.
- New API route `POST /api/billing/bills/export/zip` accepts `{ unitIds, accountSlug }`, verifies the caller has `assoc_admin` or `billing_operator` role, fetches all non-Void bills for the selected units scoped to the association, generates PDFs in parallel batches of 5 (reusing the existing `getOrGenerateBillPdf` cache), and streams back a ZIP with folder structure: `unit-{unit_no}/{period}-{bill_type}-{bill_no}.pdf`.
- Uses `fflate` (new dependency) for ZIP creation.

### UI clean-up

- **Removed floor numbers** - the `Fl. X` sub-label is no longer shown on unit rows; it was redundant and added noise.
- **Fixed duplicate status badge** - in bill type rows the status badge had been duplicated (inline in the label column AND in the Status column). The inline duplicate is removed; the badge stays only in the aligned Status column.
- **Removed "Collection by Period" section** - the collapsible period summary table that sat above the unit table has been fully removed. The four KPI tiles remain the primary summary surface.

### Migrations Changelog

_No new migrations - all changes are code only._

_Last updated: 2026-07-29_

---

## v1.2 - Reports: Filter Correctness Fixes (2026-07-29)

### Filters now actually apply to the Collection tab

Selecting a unit (or bill type) on the Reports screen changed the filter chips and the URL, but the Collection tab kept showing **association-wide totals**. Filtering to a single unit still reported every bill in the association.

The cause was the `get_collection_summary` database function: it only accepted an association id and a period range, with no way to narrow by unit or bill type. The client passed the filters to the surrounding queries but the aggregate itself ignored them, so billed / collected / bill count / collection rate were computed across the whole association regardless of what was selected.

- `get_collection_summary` now accepts `p_unit_ids uuid[]` and `p_bill_types text[]`; both default to `null`, meaning "no restriction", so existing callers are unaffected.
- The Reports screen, the Collection CSV export, and the management PDF export all pass the active filters through to the function.
- The client-side bill-type filter that ran over the returned rows was removed. It could hide rows but could not correct the amounts inside them, so it gave the impression of filtering while the numbers stayed wrong.

**Example** - unit 111 in Sandbox Residency Test previously reported ₹29,805 billed across 34 bills at a 48% collection rate (the association total). It now correctly reports ₹7,250 billed across 4 bills at 21%, matching the Billing screen for the same unit.

### Header summary no longer reports zero outstanding

The summary line under the page title read its outstanding figure from the Outstanding tab's data. Tabs are fetched lazily, so on first load that data did not exist yet and the header always claimed **₹0.0L outstanding**. It is now derived from the same filtered collection rows that produce the billed figure, so it is correct immediately and always consistent with the billed number beside it.

### Amounts stop collapsing to "₹0.0L"

The header formatted every amount in lakhs. Once filtered to a single unit, real amounts such as ₹5,750 rendered as "₹0.1L", and smaller ones as "₹0.0L" - indistinguishable from no data. Amounts below ₹1 lakh are now shown in full with Indian digit grouping, and the lakh shorthand is used only when the value genuinely reaches that magnitude.

### React warning on load

Applying a filter from the URL triggered `Cannot update a component (Router) while rendering a different component (ReportsClientPage)`, because the URL sync ran `history.replaceState` during render. The sync is now deferred until after the render pass.

### Note on an issue found while verifying

Six bills carry `status = 'Paid'` while `paid_amount` is 0. These were initially suspected of hiding unpaid dues, but on inspection all six are fully settled from the unit's advance credit (`advance_applied` equals `total_amount`), so the stored status is correct and the database is consistent. The actual defect was on the display side - see the advance-credit section in the next release below.

### Migrations Changelog

| Migration | Purpose |
| --- | --- |
| `20260729000001_collection_summary_filters.sql` | Adds `p_unit_ids` and `p_bill_types` parameters to `get_collection_summary` so Reports aggregates respect the selected unit and bill-type filters. Drops and recreates the function; read-only and non-destructive. |

_Last updated: 2026-07-29_

---

## v1.2 - Advance Credit Counted as Settlement (2026-07-29)

### Bills paid from advance were still being shown as owed

A bill can be settled two ways: by a payment (`bills.paid_amount`) or from the unit's advance balance (`bills.advance_applied`). Every screen that judged whether a bill was settled looked only at `paid_amount` and ignored `advance_applied` entirely.

The result: a bill cleared in full from a member's advance credit was displayed as **Overdue with the full amount still owed**. `displayBillStatus()` went further - it treated the database's correct `status = 'Paid'` as stale, reclassified the bill to Unpaid, then promoted it to Overdue because the due date had passed.

**Association-wide impact:** ₹9,830 across 6 bills was being demanded from members who had already paid it. Reported collection was understated at 36% when the true figure is 40%.

**Example** - unit 111 has two Other Charges bills (₹5,000 and ₹500) settled entirely from advance. The app reported ₹5,750 outstanding at a 21% collection rate. The unit actually owes **₹250** - a single Sinking Fund bill - at a **97%** collection rate.

The database was never wrong. All 190 bills were verified consistent: no bill is marked Paid while genuinely short, and no fully-settled bill is left unmarked. This was purely a reporting defect.

### What changed

- `lib/bill-status.ts` gains `billSettledAmount()` (payments + advance) and `billOutstanding()` (never negative). `displayBillStatus()` now judges against the settled amount, so an advance-cleared bill reads as Paid.
- The Billing screen's per-bill outstanding, and its per-period and per-unit `collected` totals, now count advance credit.
- The Reports Outstanding tab, its Partial/Unpaid filters, the outstanding CSV export, and the management PDF export all account for advance. The CSV gains an **Advance Applied (₹)** column so the arithmetic is auditable.
- `get_collection_summary` counts `paid_amount + advance_applied` as collected, capped at the bill total so an over-application can never report collection above the amount billed.

### Two related defects fixed

- **The Units screen never flagged an overdue unit.** Its query selected `unit_id, status, due_date` but no amount columns. With `total_amount` absent, the old sentinel default made every row compare as fully settled and return "Paid", so the overdue set was always empty. The query now selects the amount columns.
- **`displayBillStatus()` no longer guesses from missing data.** A missing `total_amount` previously defaulted to a sentinel that made any row look settled. It now derives from amounts only when they were actually selected, and otherwise falls back to the stored status.

### Migrations Changelog

| Migration | Purpose |
| --- | --- |
| `20260729000002_collection_summary_advance.sql` | `get_collection_summary` counts advance credit as collected, capped at the bill total. Drops and recreates the function; read-only and non-destructive. |

_Last updated: 2026-07-29_

---

## Audit Phase 2 - UI/UX Consistency (2026-07-30)

### Color Token System
- Added 8 CSS custom properties to `theme.css` (mirrored in `:root` and `.dark`): `--sidebar-footer-bg`, `--sidebar-footer-border`, `--sidebar-footer-fg`, `--sidebar-footer-fg-muted`, and semantic status tokens `--color-success`, `--color-warning`, `--color-danger`, `--color-info`
- Replaced all hardcoded hex literals (`#f59e0b`, `#050B14`, `#1F2D3D`) and raw Tailwind palette classes (`text-emerald-600`, `text-amber-600`, `text-red-600`, `text-blue-600`) across sidebar, topbar, billing table, bill panel, and KPI tiles with CSS variable tokens
- Removed all dead `dark:text-*` variants (app is forced light-only)

### Mobile Responsiveness
- Billing table: added `overflow-x-auto` wrapper around column headers and data rows; `min-w-[640px]` on all three grid templates - fixed-column layout now scrolls horizontally on mobile without breaking the search/filter toolbar

### Bug Fixes
- `reports-client-page.tsx`: moved `history.replaceState` URL sync out of a `setState` updater (calling side effects inside updaters is a React violation - fires twice in StrictMode); refactored `handleFiltersChange` to compute `next` state before calling `setFilters`
- Removed `setTimeout(0)` deferral from `syncUrl` - all call sites are event handlers, not render code, so the defer was unnecessary

### Type Safety
- `team-account-topbar.tsx`: narrowed `user: any` prop to `{ email?: string | null } | null`
- Created `apps/web/razorpay.d.ts` - shared `declare global Window.Razorpay` type; removed duplicate per-file declarations from both Razorpay checkout components

### Migrations Changelog

No new migrations in this phase.

_Last updated: 2026-07-30_

## Audit Phase 3 - Security & Bug Fixes (2026-07-30)

### Console Error Sanitization
- `billing-actions.ts`: removed `console.error` that leaked unit ID and raw Supabase error on RPC failure (audit log already records the failure)
- `members-page.loader.ts`: removed bare `console.error(error)` from two throw sites; `profilesError` now logs only `.message` as a warning (phone numbers degrade gracefully to null)
- `admin/accounts/page.tsx`: downgraded non-fatal `console.error` to `console.warn` with `.message` only
- `cash-ledger-payments/[id]/pdf/route.ts`, `by-receipt/route.ts`: `console.error` now logs `.message` instead of raw Supabase error object

### Type Safety
- `payments-actions.ts`: removed `'record_payment' as any` cast - now covered by regenerated database types
- Regenerated `database.types.ts` from remote Supabase project (`vkxchopjqakvftcnxwie`) - adds `cash_ledger_payments`, `pending_sinking_fund_charges`, `record_payment` RPC, and other previously missing tables/functions

### Route Handler Auth Pattern
- `statement/pdf/route.ts`: converted from manual `async function GET(req)` + explicit `if (!user) return 401` to `enhanceRouteHandler({ auth: true })` - standard kit pattern; uses injected `user` from handler params (eliminates redundant `getUser()` round-trip and non-null assertion crash path); merged duplicate `@kit/pdf-templates` imports; added structured `getLogger()` error logging in the PDF render catch block

### Reliability
- `billing-actions.ts`: wrapped success `logAuditEvent` call in try/catch - a logging failure can no longer shadow successfully committed bills or trigger a duplicate-generation retry

### Code Cleanup
- `units/[unitId]/page.tsx`: removed stale `// removed duplicate personLabel` comment

### Migrations Changelog

No new migrations in this phase.

## Audit Phase 4 - Performance (2026-07-30)

### Query Parallelisation
- `billing/page.tsx`: `isSuperAdmin` + `association` queries now run in `Promise.all` (saves 1 serial round-trip per billing page load)
- `units/page.tsx`: same batch 1 parallel, plus `tenancies` + `openBills` run in a second `Promise.all` after `units` resolves (saves 2 serial round-trips)
- `electricity/page.tsx`: `sub_meters` + `mescom_bills` now in `Promise.all` after units - `bills` only needs `association.id`, not sub-meter data (saves 1 round-trip)
- `statement/page.tsx`: `billRows` + `advanceRows` (cash ledger) now in `Promise.all` - both need only `unitIds` (saves 1 round-trip)
- `statement/pdf/route.ts`: same `billRows` + `advanceRows` parallelisation in the PDF route

### Dynamic Recharts Imports (P-08)
- `reports-tabs.tsx`: all 5 Recharts-heavy tab components (CollectionTab, OutstandingTab, PaymentsTab, CashLedgerTab, ElectricityTab) converted to `next/dynamic` with `ssr: false` - Recharts (~250 KB) is now excluded from the initial bundle and only fetched when the Reports route is visited; a pulse-skeleton loader shows during hydration

### Loading States (P-09)
- Added `loading.tsx` (GlobalLoader) for 10 routes missing one: billing, payments, reports, electricity, cash-ledger, statement, units, notifications, audit, members - eliminates blank-white flash during server data fetching on navigation

### PDF Response Headers (P-10)
- Bills, receipts, advance-applications, and cash-ledger-payments PDF routes now return explicit `Cache-Control` headers:
  - `bills/[billId]/pdf`, `receipts/[paymentId]/pdf`, `cash-ledger-payments/[id]/pdf`: `private, no-store` (bills can be voided, payments reversed - must not cache stale PDFs)
  - `advance-applications/[voucherNo]/pdf`: `private, max-age=3600` (advance vouchers are immutable once created)

### Migrations Changelog

No new migrations in this phase.

## Audit Phase 5 - Polish & Accessibility (2026-07-30)

### Loading & Error Boundary Consolidation
- Replaced 10 per-route `loading.tsx` files (Phase 4) with a single `[account]/loading.tsx` - Next.js propagates it to all child routes automatically; per-route files are only needed for different loaders
- Replaced 8 per-route `error.tsx` files with a single `[account]/error.tsx` using `Trans` i18n keys (`common.genericError`, `common.genericErrorSubHeading`, `common.tryAgain`) - the account layout remains visible on error; `billing/error.tsx` is kept as the only route-specific override (custom UI with breadcrumbs and billing-scoped i18n keys)

### Accessibility - Icon Button Labels
- `units/_components/units-table.tsx`: added `aria-label` to the icon-only delete button - screen readers now announce the specific unit being deleted

### Accessibility - Table Column Headers
- Added `scope="col"` to `TableHead` elements in primary data tables: units table, payments section, bill-payments dialog, statement table, notifications log, audit log - satisfies WCAG 2.1 SC 1.3.1 for data tables

### Accessibility - Sortable Column
- `statement/_components/statement-table.tsx`: date sort column header now carries `aria-sort="ascending"` / `aria-sort="descending"` reflecting the current sort direction

### Migrations Changelog

No new migrations in this phase.

_Last updated: 2026-07-30_

## Statement UX & Terminology (2026-07-30)

### Statement Page - Custom Date Range
- `statement/_components/statement-table.tsx`: added "Custom range" option to the period selector; selecting it reveals two date inputs (From / To) inline in the filter toolbar
- Filter, opening balance, and running balance calculations all respect the custom range
- PDF download and CSV export both pass the custom date bounds; CSV filename reflects the chosen range

### Statement Page - Download Dropdown
- Replaced the two separate "PDF" and "CSV" buttons with a single "Download ▾" dropdown - cleaner toolbar, same functionality

### Statement Tile Copy - Plain Language
- "LEDGER BALANCE" → "BALANCE"; "Ledger settled" → "All clear"; "Credit balance" → "In credit"; "Amount owed per ledger" → "You owe"
- Advance-restriction note rewritten in plain English
- "TOTAL CREDITS" → "TOTAL PAID IN"; "Advances & payments" → "Payments & advances"
- "TOTAL DEBITS" → "TOTAL CHARGED"; "Bills raised this period" → "Bills for this period"

### Terminology - Export → Download
- All user-visible "Export" labels changed to "Download": `ExportMenu` button, bulk bill PDF button in billing table, toast messages, error strings
- "Export" is reserved for future email-attachment flows

### Bug Fixes (2026-07-30)
- **PDF download error on Maintenance receipts**: `packages/pdf-templates/src/assets/fonts/register.ts` - added explicit italic font variants (regular-italic, bold-italic) so react-pdf resolves `fontStyle:'italic'` in the cash-ledger receipt template without throwing
- **Statement PDF ignored custom date range**: `app/api/billing/statement/pdf/route.ts` - now reads `from`/`to` query params; period label and filename reflect the custom window
- **Statement closing balance wrong in default sort**: `statement-table.tsx` - `closingBalance` now reads the last entry when ascending (was reading first)
- **Custom date state lost on refresh**: statement page now passes `initialFrom`/`initialTo` from URL search params to `StatementTable`; state is restored correctly on reload
- **Inverted date range silent zero**: custom range with "from > to" now shows a validation message instead of silently showing 0 rows

_Last updated: 2026-07-30_

## Plain-English Wording Audit (2026-07-31)

Comprehensive wording pass across all user-facing pages to remove accounting jargon and replace it with plain, simple language.

### Terminology Changes

- **"Void" / "Voided"** → **"Cancelled"** - bill status throughout billing tree (`unit-billing-types.ts`, `unit-row.tsx`)
- **"Reversed"** (badge) → **"Refunded"** - payment history in `bill-detail-panel.tsx` and `statement-table.tsx`
- **"Advance applied"** → **"Advance deducted"** (`bill-detail-panel.tsx`), **"Advance used"** (type badge and CSV label in `statement-table.tsx`, `cash-ledger-tab.tsx`, `cash-ledger-section.tsx`)
- **"Opening balance"** → **"Starting balance"** - statement table and CSV export
- **CR / DR suffixes** → **↑ / ↓** - running balance in statement, cash ledger section, and cash ledger reports tab
- **"Debit" / "Credit"** columns → **"Charged" / "Paid In"** - statement table and CSV headers
- **"Advance deposits"** → **"Advances paid"** - statement summary line
- **"% collected"** → **"% received"** - billing overview KPI tile

### Navigation & Labels

- **Nav: "Audit Log"** → **"Activity Log"** (i18n `association.json`)
- **Settings: "Workspace Features"** → **"Optional Features"** (`workspace-features-card.tsx`)
- **Settings danger-zone description** → "These actions permanently delete data which cannot be undone" (i18n `association.json`)

Reviewed and deliberately kept as-is: **"Cash Ledger"** (nav, Reports tab, Settings toggle), **"Billing Operator"**, and **"Danger Zone"**. These terms are established for this audience, so the proposed renames were rolled back.

### Reports / Charts

- **"Ageing Buckets"** → **"Overdue by Age"** (`outstanding-tab.tsx`)
- **"Top Defaulters"** → **"Highest Outstanding"** (`outstanding-tab.tsx`)
- **KPI tiles: "Total Credits"** → **"Total Received"**, **"Total Debits"** → **"Total Charged"**, **"Net Movement"** → **"Net Balance"** (`cash-ledger-tab.tsx`)
- **"Monthly Cash Flow"** → **"Monthly Activity"** (`cash-ledger-tab.tsx`)
- **"Credits by Charge Type"** → **"Received by Charge Type"** (`cash-ledger-tab.tsx`)
- **Table column "Entry Type"** → **"Type"**, **"Dir."** → **"In / Out"** (`cash-ledger-tab.tsx`)
- **"incl. advance applied"** → **"incl. advance credit used"** (`collection-tab.tsx`)

### Forms & Dialogs

- **"Add Cash Ledger Entry"** dialog title → **"Record a Due" / "Record an Advance Payment"** (context-aware, `add-cash-ledger-entry-dialog.tsx`)
- **Form field "Mode"** → **"Payment Method"** (`record-payment-dialog.tsx`)
- **Form field "Reference No"** → **"Transaction Reference"** (`record-payment-dialog.tsx`)
- **Confirm button "Confirm Generation"** → **"Yes, Generate Bills"** (`bills-section.tsx`)
- **Toast: "Cash Ledger enabled/disabled for this workspace"** → plain message (`workspace-features-card.tsx`)

### Payments Table

- **Column header "Outstanding"** → **"Amount Owed"** (`payments-section.tsx`)

### FY Filter

- **"FY 2024-25"** format → **"Apr 2024 – Mar 2025"** - statement FY dropdown and active period label (`statement-table.tsx`)

_Last updated: 2026-07-31_

## Billing: Layered Restructure & Performance Pass (2026-07-31)

Billing moves from one page rendering everything to a tiles-first drill-down across four routes, each fetching only what it renders.

### New structure

| Route | Shows |
|---|---|
| `/billing` | KPI tiles + links to the two jobs below |
| `/billing/units` | Bills by Unit - one row per unit, with charge-type and period filters |
| `/billing/units/[unitId]` | One unit: period → charge type → line items & payments |
| `/billing/drafts` | Pending charges, unbilled electricity/maintenance, Generate Bills |

Sidebar keeps a single "Billing" item; drill-down uses back links, matching the `units/[unitId]` convention.

### Removed

- **"Generated Bills" tab deleted** (~420 lines). It duplicated Bills by Unit - same bills, flat instead of grouped, with a second filter/pagination/status pipeline. Its two genuinely useful capabilities (charge-type + period filters, CSV/PDF export of the filtered set) moved onto the unit list.
- **`bills-section.tsx`, `billing-period-detail.tsx`, `billing-unit-sheet.tsx` deleted.** The `?period=` drill-down is superseded by the period-filtered unit list.

### Regression fix - voided bills counted as live (introduced in `a9cd5cba`)

The previous wording pass renamed the "Void" bill status to "Cancelled" with a blanket find-and-replace, which also rewrote `VOID_STATUSES` in `unit-billing-types.ts` - the set of **database** `bills.status` values used to *detect* voided bills. It became `['Cancelled', 'Cancelled', 'Reversed']`, which no bill in the database matches.

Effect: every voided bill was treated as live on the Billing screen, inflating billed, collected, outstanding and overdue totals, and losing its strikethrough styling. `'Void'` is confirmed as the stored value by `.neq('status', 'Void')` in `statement/page.tsx`, the statement PDF route and the bulk ZIP route.

Restored to `['Void', 'Voided', 'Reversed']`, with a comment marking these as stored values that must not track UI labels. The `displayStatus` sentinel stays "Cancelled" - that one is internal and used consistently.

### Three further correctness bugs fixed - all the same root cause

`advance_applied` (bill settled from a unit's advance credit) was missing from the row type used by three surfaces, so `billSettledAmount()` saw those bills as unpaid:

- **Outstanding tile overstated** - computed `total − paid`, ignoring advance credit already applied
- **Overdue tile overcounted** - `displayBillStatus()` classified advance-settled bills as Unpaid, then Overdue once past due
- **CSV export wrong** - `outstanding` column had the same omission (`export-csv.ts`)

All three now use the shared `billOutstanding()` from `~/lib/bill-status`.

### Performance

- **Dropped the `bill_line_items` join** from list queries. Line items were fetched for every bill on every page load despite only being rendered on expand - `fetchBillDetailAction` already loads them lazily.
- **Bill set no longer serialised three times.** `BillingOverview` is now a server component, so `/billing` ships zero bill data to the client.
- **Whole `cash_ledger` table fetch replaced** with the existing `get_association_cash_ledger_balances` RPC, which aggregates in Postgres (already used by the payments page).
- **Level 3 queries scoped by `unit_id`** instead of loading every bill for the association.
- **`loading.tsx` added** to each route so child navigations stream a skeleton.
- **New `_lib/billing-queries.ts`** holds the shared select shapes. Each route previously declared its own select string, which is how the line-items join drifted into a query whose own type comment says line items are excluded.

### UX / consistency

- Unit rows navigate instead of expanding; charge-type and period filters narrow the unit list, and units outside the chosen slice drop out rather than showing 25 rows of "No bills yet"
- Export acts on every unit the current filters leave visible, not just the current page
- `alert()` replaced with `toast` in the bulk PDF download path
- URL sync no longer rewrites the whole query string - it touches only `filter`, `type` and `duration`
- Legacy URLs redirect rather than silently dropping their filter: `?filter=`, `?status=`, `?duration=`, `?period=`, `?bills=draft` and `?unit=` (which now resolves the unit number to its detail page). Dashboard tiles updated to link directly.

_Last updated: 2026-07-31_

---

## Billing: Content Boundary, UX Polish & PDF Fixes (2026-07-31)

### Content boundary - billing pages now contain only billing data

Payment History and Cash Ledger data were removed from all billing surfaces so each module owns its own domain:

- **`BillDetailPanel`** - removed the Payment History section (moved to the Payments module) and the "Advance deducted" line item row (advances belong in Cash Ledger)
- **`unit-row.tsx`** - removed the advance credit chip ("+₹X" badge next to owner name)
- **`units/page.tsx` and `units/[unitId]/page.tsx`** - removed `get_association_cash_ledger_balances` RPC query and `advanceByUnitFromBalances` usage; `UnitSummaryInput` no longer carries `advance_balance`
- **`units/[unitId]/page.tsx`** - removed the "Advance Credit" stat from the unit summary strip
- **`unit-billing-actions.ts`** - payments parallel query removed; `fetchBillDetailAction` now returns only `{ lineItems }`, matching the updated `BillDetail` interface

### PDF export fixes

- **"OutstandingStatus" merged column** - fixed by adding `gap: 4` to all row/header flex containers in `bills-export-document.tsx`
- **Outstanding ignoring `advance_applied`** - route now uses `billOutstanding()` (shared function that accounts for advance credit)
- **Raw DB status values in PDF** - route now uses `displayBillStatus()` for all status cells
- **`totalCollected` understated** - fixed by computing as `totalBilled − totalOutstanding` (advance credit now counted)
- **Overdue rows** - highlighted with `#fff5f5` background; outstanding amount in red, status bold red

### Page header fix

`TeamAccountLayoutPageHeader` was accepting a `title` prop but never forwarding it to `PageHeader`. Every billing sub-page showed "Billing" in the header regardless of route. Fixed - sub-pages now show "Bills by Unit", "Unit 101", "Draft Bills" etc.

### Draft Bills button placement

"Other Charges" and "Sinking Fund" buttons moved from a standalone block above the table to the section card headers where their charges appear. "Generate Bills" moved to the top filter bar. Actions are now contextually adjacent to the data they affect.

### Cash Ledger pagination

`cash-ledger-section.tsx` gained client-side pagination (50 entries per page) with a prev/next footer row showing the current range and total entries.

### UX micro-improvements

- Unit row `ChevronRight` nudges right on hover to reinforce navigation affordance
- Row padding increased (`py-2.5 → py-3`) for better touch targets
- Status badge `text-[10px] → text-xs` on unit rows and unit detail page
- **Metrics chips added to Bills by Unit table** - Units, Billed, Outstanding, Overdue counts shown inline in the filter bar, matching the Payments page chip pattern (`bg-muted/50 rounded-md`)
- **Unit detail summary strip** now uses the same chip style (`bg-muted/50 rounded-md`) as the Payments page instead of bare `flex-col` labels
- **`₹0 paid` bug fixed** - when a bill is fully settled by advance credit (`advance_applied`), the "paid" column now shows `paid_amount + advance_applied` instead of `₹0` in green
- **Draft Bills page redesigned** - summary bar replaced with metric chips (Items pending, Electricity months·total, Other Charges count·total, Sinking Fund count·total); redundant info paragraph removed; section ordering changed to Maintenance → Electricity → Other Charges → Sinking Fund; "0 charges" badges removed from empty sections; dialog trigger buttons now read "+ Other Charges" / "+ Sinking Fund" for clear affordance
- **Column header font** `text-[10px] → text-[11px]` on the unit billing table
- **Bill-type row chevron** `h-3 w-3 → h-3.5 w-3.5`; status badge `text-[10px] → text-xs`; sub-labels `text-[9px] → text-[10px]` in the unit detail tree

_Last updated: 2026-07-31_

## Billing: Color, Typography & Bug Fixes (2026-07-31)

### Background color clean-up

Replaced the amber-tinted muted wash on billing surfaces with targeted, purposeful use:

- **Toolbar strip** (`bg-muted/40` removed) - now white; border-b is sufficient separation
- **Column header row** (`bg-muted/60 → bg-muted/40`) - lighter tint, still clearly distinguishable from data rows
- **Pagination footer** (`bg-muted/40` removed) - matches the clean white toolbar
- **Bill-type rows** - resting `bg-muted/10` removed; replaced with `bg-muted/5` to preserve touch affordance without the brown wash; hover remains `bg-muted/30`
- **Draft Bills total rows** - `bg-muted/40 → bg-muted/20` for a lighter summary stripe
- Metric chips, expanded bill detail, and period hover/expanded states all retained for visual hierarchy

### Typography - global +2 px font-size bump across all billing components

All font sizes in billing pages increased by 2 px for improved legibility. Subscription/Stripe dialogs excluded. All `text-[12px]` inline values normalised to canonical `text-xs`.

### Bug fix - Retry button in Bill Detail Panel

Retry after a network error now actually re-fetches (previously it cleared the error but the `useEffect` deps didn't change, leaving a blank panel). Fixed with a `retryCount` counter dep. Added `type="button"` to prevent accidental form submission.

_Last updated: 2026-07-31_

---

## Database Query Performance (2026-07-31)

Three confirmed bottlenecks from `pg_stat_statements` analysis - all fixed in a single migration (`20260731000000_query_performance.sql`).

### Fix 1 - `is_aal2()` and `is_super_admin()` marked STABLE

Both functions were `VOLATILE` by default (the plpgsql default), causing PostgreSQL to re-evaluate them on every row during RLS policy checks. Both functions only read `auth.jwt()`, which is constant within a transaction - making them `STABLE` by definition. Added `STABLE` + `SECURITY DEFINER` to both. This eliminates per-row JWT parsing overhead across every RLS-gated table in the app. `is_super_admin()` alone was called **33,310 times** in the pg_stat_statements window, contributing ~7 seconds of cumulative DB time.

### Fix 2 - Missing index on `bill_line_items(bill_id)`

PostgreSQL FK constraints do not auto-create indexes on the referencing column. Every bills-with-line-items fetch was performing a sequential scan on `bill_line_items` filtered by `bill_id`. Supabase's index advisor confirmed this, projecting a **3× cost reduction** (startup cost 622 → 211). Added `idx_bill_line_items_bill_id`.

### Fix 3 - `team_account_workspace()` marked STABLE

The function is a pure read (no writes) and was `VOLATILE` by default. Marked `STABLE` to allow the planner to fold repeated invocations. This function is called ~6,000 times per pg_stat_statements window (once per workspace page load).

### Migrations Changelog

| Migration | Description |
|-----------|-------------|
| `20260731000000_query_performance.sql` | Mark `is_aal2`, `is_super_admin`, `team_account_workspace` as STABLE; add `idx_bill_line_items_bill_id` |

_Last updated: 2026-07-31_

---

## Bug Fix - Bulk Invite: Existing Users Not Added to New Association (2026-07-31)

### Root cause

`bulkInviteMembersAction` ran in three phases: (1) validate rows, (2) create any new users, (3) insert memberships. Phase 2 had two defects:

1. **Silent RPC error swallow** - the initial batch lookup (`find_users_by_phones_or_emails`) destructured only `data`, discarding `error`. If the RPC failed, all users appeared new to the code.

2. **No recovery on createUser conflict** - if the initial lookup missed an existing user (RPC error, phone-format mismatch, race condition), Phase 2 called `auth.admin.createUser`, which failed with "already been registered". The code put that phone into `createFailures` and Phase 3 then **skipped** the user - they never got their membership in the new association.

### Fix (`packages/features/admin/src/lib/server/admin-server-actions.ts`)

- **RPC error now logged** - `lookupError` extracted and emitted so failures appear in production logs. Import continues; Phase 2 acts as the safety net.
- **Recovery on createUser conflict** - when `createUser` returns an "already registered" error, a targeted `find_users_by_phones_or_emails` call is made for just that phone/email. If found, the user is added to `existingUserByPhone` (bypassing `createFailures`) so Phase 3 inserts their membership normally.

No schema changes. No migration needed.

_Last updated: 2026-07-31_

## Billing: White Surfaces + GST & Due Date Fixes (2026-07-31)

### Root cause of the "gray background" on billing pages

The billing containers (`rounded-xl border`) carried **no background fill**, so the global
canvas token showed through them. That token is `--background: #fffdf5` - a warm cream, not
white. Earlier passes chased `bg-muted/*` utilities, which were never the cause.

Fixed by giving every billing surface `bg-card` (`--card: #ffffff`, true white), so white
content cards now sit on the cream canvas:

- Bills by Unit table container
- Unit detail bill tree container
- Draft Bills outer card and each inner section card
- Overview page nav cards (Bills by Unit / Drafts) - hover moved to `bg-accent/40`
- All four loading skeletons
- Download PDF button in the bill detail panel (`bg-background` → `bg-card`)

Dialogs already used `bg-popover` (`#ffffff`) and needed no change. Retained `bg-muted` only
where it is a chip, hover state, expanded-row indicator, or progress-bar track.

### Bug fix - due date shown in red on fully paid bills

`BillDetailPanel` coloured the due date red whenever the date was in the past, regardless of
whether the bill was settled, so a paid bill read as alarming. The date is now red only when
the bill has an outstanding balance **and** is past due, via the shared `billOutstanding()`
helper. The comparison also moved from `new Date(due_date) < new Date()` - which parses the
date column as UTC midnight and drifts against local time - to an ISO string comparison
against `todayInBillingZone()`, matching `displayBillStatus()`.

### Bug fix - spurious GST badge and PDF column on non-GST bills

`gst_applicable` is a property of the **charge type** ("taxable if this association is
GST-registered"), not proof that tax was charged; GST is only levied when the association has
`gstEnabled && gstRate > 0`. Bills from non-GST associations carried the flag but no tax, so:

- The screen showed a `GST` badge on line items of a bill with no GST (e.g. 500 sq.ft × ₹3 =
  ₹1,500 exactly). The badge is now gated on `bill.gst_amount > 0`.
- The bill PDF printed a `GST` column reading "Yes" per line item on bills with no tax. That
  column is now conditional on the existing `showGst` flag, following the same pattern as
  `hasAreaColumns`. The description column absorbs the freed width (`flexGrow: 1`).

_Last updated: 2026-07-31_

---

## Infrastructure: Three-Environment Setup - 2026-08-04

### Overview

Separated the single Supabase project into three distinct environments - local Docker, Ooruda Development (staging), and Ooruda Production - to eliminate the risk of feature development affecting live data.

### Environments

| Environment | Supabase Project | Branch | Deployment |
|---|---|---|---|
| Local | Docker (local) | any | `pnpm supabase:web:start` |
| Dev/Staging | Ooruda Development (`bcdosjrbkkemsqowhigj`) | `release` | ooruda.vercel.app |
| Production | Ooruda Production (`vkxchopjqakvftcnxwie`) | `main` | ooruda.com |

### Changes

- **Schema reconciliation migration** (`20260804093956_reconcile_schema_drift.sql`): Dropped two orphaned functions (`get_user_id_by_email`, `get_user_id_by_phone`), fixed `account_image` storage policy WITH CHECK clause, revoked all anon table grants and blocked future grants via ALTER DEFAULT PRIVILEGES.
- **Ooruda Development project** created on Supabase with all 112 migrations applied, storage buckets configured, edge functions deployed, auth hooks wired, and SMS secrets added to match production.
- **Dev database seeded** with production data backup then scrubbed of all real association data - only 3 test associations and test users remain.
- **`.env.local`** restructured with active/inactive blocks for easy environment switching.
- **`scripts/db-push.sh`** - guardrail script added to prevent accidental migration pushes to production. Blocks `supabase db push --linked` unless `--production` flag is explicitly passed with a "yes" confirmation. Deployed to all active branches (`main`, `release`, `bugfixes`, `bugfixes_main`, `v1.4`).
- **AGENTS.md** updated to document the 3-environment workflow and standard migration end-to-end steps.

### Migrations Changelog - v1.4

| Migration | Description |
|---|---|
| `20260803000000_void_bill.sql` | Add `'Void'` status, `void_reason/voided_at/voided_by` columns, guard `sync_bill_payment_status` trigger, `void_bill()` and `void_bills_bulk()` SECURITY DEFINER functions |
| `20260728000002_cash_ledger_bill_numbering.sql` | Patched to enable RLS on `cash_ledger_sequences` (missed in original migration) |
| `20260804093956_reconcile_schema_drift.sql` | Drop orphaned functions, fix `account_image` storage policy, revoke anon grants |
| `20260805000002_missing_fk_indexes.sql` | 8 missing FK indexes (CONCURRENTLY), GIN trigram indexes on `profiles.full_name` and `audit_logs.action`, new `get_unit_ledger_balances()` RPC for DB-side aggregation |

_Last updated: 2026-08-05_  <!-- Performance audit Phase 1-9 -->
