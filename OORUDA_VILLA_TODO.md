# Ooruda Villa — TODO / Deferred

Companion to `OORUDA_VILLA_PLAN.md`. Items here are **out of v1.0** or awaiting a decision.
Anything that becomes active moves into the plan's milestones.

---

## Deferred features

### Subscription / pricing for the Ooruda Villa product
**Priority:** later, but needed before the product is sold beyond the first customer.
Decide the model (flat subscription per villa, tiered by properties, or commission per booking),
then wire it up. Notes:
- Makerkit team-account billing already exists but is switched off
  (`NEXT_PUBLIC_ENABLE_TEAM_ACCOUNTS_BILLING=false`, `packages/billing`).
- Turning it on affects **association** accounts too unless gated by `accounts.product_type`.
- Commission-per-booking would need booking volume from `villa_bookings_mirror` and a metered
  subscription item — heavier than a flat plan.
- Open: does the villa owner or Ooruda hold the Razorpay account for guest payments? Today it is
  the villa's own account, on the guest site. Ooruda's refund path (plan §9b) needs API keys for
  whichever account it is — store them in Vault alongside the villa DB credentials.

### S3 — management company with multiple owners in one account
A property-management company running villas on behalf of *different* owners. Owner A must not see
owner B's revenue. This is multi-owner authorization, not multi-property, and needs per-property
ACLs inside an account plus a per-owner statement. Out of v1.0; design separately if a customer
asks.

### S5 — room-level / homestay selling
Selling individual rooms rather than the whole villa. Changes the availability grain on both sides:
the guest site's `create_booking_atomic` and `check_availability` are whole-property. Would need a
`villa_booking_rooms` join and a per-room overlap predicate in the `villa-booking` repo. Flag before
onboarding any customer who works this way.

### Journal / content editor
`villa-booking/docs/OORUDA_VILLA_INTEGRATION.md` §9 already specifies Ooruda writing
`journal_posts` and calling `POST /api/revalidate` with `CONTENT_REVALIDATE_SECRET`. A useful SEO
lever for the villa owner, but not operations. Build after M8 if wanted.

### Channel manager / OTA integration
Lives in the `villa-booking` repo — `channel_sync_log` and `external_reservations` are already
there, unused. Ooruda's only involvement is reading OTA-sourced bookings out of the mirror for
revenue and channel-mix reporting, which M6 covers. No Ooruda work needed until the CM is chosen.

### Mobile app for owners / managers
`react-native-expo-turbo-saas-kit` was noted in the original plan. Far future.

### Foreign-national registration (separate form) — raised 2026-10-31
The Villa 19 guest registration card is built for Indian guests. A foreign national needs more
than a nationality line, and the villa has a statutory reporting duty:
- **Form C** must be filed with the Bureau of Immigration for every foreign guest, within 24 hours
  of check-in, on the FRRO portal (`indianfrro.gov.in`). Hotels, guest houses and homestays are
  all covered; a villa let commercially is in scope.
- Fields the current card does not capture: passport number, place and date of issue, date of
  expiry, visa number / type / validity, date of arrival in India, port of arrival, purpose of
  visit under the visa, and the next destination with intended departure date.
- Design it as a **second per-property template** in the same registration-card registry
  (`villa19-foreign`), chosen by a nationality toggle on the download button rather than by
  guessing from the booking — staff know on arrival, the booking record does not.
- Also needs a photocopy of the passport photo page and the visa/stamp page kept with the guest
  documents, under the existing `villa_guest_documents` purge path.
- Open question for the owner: does Villa 19 actually accept foreign guests today? If yes this
  moves from deferred into a milestone, because the Form C duty is not optional.

### Refund ladder on a part-paid booking — FIXED 2026-11-04
**Was:** `CANCELLATION_TIERS.fraction` was documented as a fraction of the total
**paid**, but `renderGuestEmail` fed `cancellationOutlook` the contract total
(`total > 0 ? total : paid`). A ₹54,280 stay held with a ₹10,000 advance was
therefore promised "₹54,280 will be refunded", under the company's CIN and
GSTIN, on money the villa had never received.

**Settled instead:** a tier's percentage is a share of the **full stay value**,
so its complement is a cancellation charge the guest owes whatever they have
prepaid. The refund is what receipts exceed that charge by:

    charge = stay value − round(stay value × fraction)
    refund = max(0, received − charge)

On the example above the 50% tier charges ₹27,140 against a ₹10,000 advance, so
the row reads "no refund" and the villa retains the advance.

Why this basis and not "a share of what was paid":
- **A stay paid in full is arithmetically unchanged** — `round(total × fraction)`
  to the paise. No regression, and `villa-booking` (whose bookings are all paid
  in full) stays correct with no change of its own, so the two codebases do not
  diverge.
- It is the standard cancellation-charge model: the fee attaches to the booking,
  not to the prepayment, which is what "50% of the stay" is read to mean.
- It makes the advance protective. Computing the ladder on the amount received
  would refund half the advance; capping a stay-value refund at the amount
  received would refund all of it, leaving the villa nothing in the 50% band.

**The shortfall is written off, not billed** (decided 2026-11-04). A charge above
what was received yields no refund and no demand on the guest.

**Wording unchanged — deliberately.** The table keeps the shape every other
booking gets; only the figures move. No explanation of the charge basis and no
mention of the write-off was added, so a part-paid guest sees the same three
windows as anyone else:

      Until Wed 21 Oct, 11:59 pm      ₹10,000 will be refunded
      22 Oct 12:00 am to Wed 28 Oct   no refund
      After Wed 28 Oct, 11:59 pm      no refund

Two consequences that fell out of the new arithmetic, both reusing existing
copy rather than adding any:
- **An all-empty ladder is now stated as "This booking is non-refundable."**
  rather than a list of rows that each say "no refund" — the existing `none`
  state. Reached when the charge already exceeds everything received.
- **`lastRefundableAt` now names the last tier that actually pays**, not the
  last one still open in time. On a part-paid stay those differ, and the old
  one promised eligibility up to a date by which the charge had swallowed the
  advance.

Covered by `cancellation.test.ts` (7 new cases, including a guard that the
paid-in-full ladder is unchanged) and `guest-emails.test.ts`. `advanceUnknown`
cannot reach a confirmation: the email is gated on `hasRecordedPayment`, the
same `ledger.netPaidPaise` that fills `amountPaidPaise`.

**Still open — for the CA, with the SAC 996311 question in
`OORUDA_VILLA_OPEN_ITEMS.md` §A:** `total_amount` is GST-inclusive, so a charge
of "50% of the stay" retains a GST component. Retention and cancellation charges
are generally taxable in India, which means output GST on the retained amount.
This affects how retained money is booked, not the email.

### Signed registration card scan-back — raised 2026-10-31
The guest signs the printed card on arrival and hands it back on paper. Storing the signed copy
is deliberately out of v1: the data loader and template are being written so it drops in later.
When wanted: upload the scan against the booking through the existing
`villa_guest_documents` / `villa_guest_document_files` path with `stage = 'check_in'` and the
property's `retention_days` driving `purge_after`, and show it in the booking's guest-documents
panel beside the ID documents. No new table.

---

## Cross-repo work required (`villa-booking`)

**Specced in full in `villa-booking/TODO.md`**, section "Ooruda Villa integration — work owed by
this repo" (added 2026-09-27). Handled in a separate session, not this workstream. Summary so the
dependencies are visible from here:

| Item | Blocks on the Ooruda side |
|---|---|
| Discount codes: schema + atomic enforcement inside `create_booking_atomic` | M8 stays dark behind a flag until this lands |
| Pricing-rule GiST exclusion constraint | nothing — Ooruda checks overlaps anyway; this is defence in depth |
| Room-level selling (grain change) | nothing in v1.0; required before onboarding a room-selling villa |
| Razorpay webhook stays **off** (decided) | nothing — Ooruda owns refunds (plan §9b) |
| Add-on services reconciliation | extra bed / add-ons selectable online |
| `properties.gst_rate` replacing a hardcoded 18 | M5 invoices read the property setting once this lands |
| Privacy page: guest-ID storage notice | **M4 upload feature must not be enabled until this and Ooruda's own notice are both live** |
| Who sets `bookings.status = 'completed'` | M3 check-out action |
| Contract document updates | every item above |

## Tech debt created by this workstream

- `villa_expenses` / `villa_expense_categories` duplicate `expenses` / `expense_categories` /
  `vendors`, which are `association_id`-scoped. Consolidate to `account_id`-scoped shared tables
  once the villa module is stable. Mirror this entry into `TECH_DEBT.md` when M5 lands.
- `association_payment_gateways` stores `key_secret` as plaintext in a table. Not extended by this
  work (the villa service-role key goes in env vars), but the existing pattern should move to
  Supabase Vault.
- `roles.hierarchy_level` is a single global ordering across two products. Villa roles sit at 5–6,
  below `tenant` at 4. Harmless while the role sets never share an account; revisit if that changes.

## Deferred from the M0 review (2026-09-27)

- **One source of truth for roles.** Role lists and the role→product mapping exist in
  `apps/web/lib/roles.ts`, `packages/features/admin/.../create-user.schema.ts`
  (`ASSIGNABLE_ROLES`, `ROLES_BY_PRODUCT`), `create-association.schema.ts`
  (`ACCOUNT_PRODUCT_TYPES`), `members/_lib/server/assoc-permissions.loader.ts`
  (`DEFAULT_INVITE_ROLES`), an inline check in `admin-edit-user-dialog.tsx`, and the database
  (`roles.product_type`). Move them into a shared package importable by both `apps/web` and
  `packages/features/admin`, and add a test that the TypeScript hierarchy levels match
  `public.roles`. Not done in M0 to keep the change surgical; the DB trigger is the real guard.
- **Pass `productType` explicitly to the UI.** The sidebar, topbar and members page infer the
  product from the viewer's role (`productForRole`). That is sound because the DB guarantees a
  role belongs to its account's product, and unknown roles see nothing. Still, threading
  `accounts.product_type` from `getAccountContext` through the workspace loader would be cleaner.
- **`rbac.ts` `ROLE_HIERARCHY`** duplicates the association half of `ROLE_HIERARCHY_LEVEL_BY_ROLE`.
- **Shared `create_team_account(..., p_product)`** could replace the separate `create_villa_account`.

## Deferred from the M2 review (2026-09-29)

- **Translate the villa settings screens.** Labels and messages are plain English,
  like the other Ooruda feature forms (Expenses, AMC). Move them to `villa.json`
  when the villa module is translated.
- **App-wide form labels.** `@kit/ui/form`'s `FormControl` is fixed (makerkit
  layer); the ~190 non-villa form fields still pass the input as a child instead
  of via `render`, so their labels are not tied to the input. Tracked as a
  separate task.
- **Editing a seasonal rate** is delete-and-re-add for now.
- **Add-on history for invoices (M5):** invoice lines must snapshot the add-on's
  name, price and unit at the time, since add-ons can be edited or removed.


## Deferred from the channel-stay enrichment review (2026-11-02)

The major findings were fixed in the change itself; these are the minor ones.

- **The channel name is stored twice.** `channelBlockNote` writes the feed's
  name into the block note, but every reader takes the name from `ical_feeds`,
  so the copy in the note can drift after a rename. Cosmetic only: the note is
  operator-facing prose that the booking site's own admin displays, and no
  reader takes the channel from it. The misread it used to cause is fixed
  (below). Left in place deliberately — the note has to read as a sentence on
  the site, where the feed name is not otherwise on screen.
- **The block/booking pairing is assembled in three pages** (bookings, calendar,
  blocked-dates): read blocks, read linked bookings, `linkChannelStays`, invert
  the map. Worth one server helper (`loadChannelStays`) that owns the window;
  `linkChannelStays` stays pure and keeps its tests.
- **"Statuses that still hold nights"** is written out in `channel-link.ts`
  (`HOLDING`), in `listChannelLinkedBookings`, and twice in SQL. Share the TS
  pair from `lib/villa/constants.ts`.
- **New channel-stay UI is hard-coded English** (enrich dialog, the channel row,
  the Blocked list buttons), like the rest of the villa module. Move to
  `villa.json` with the rest when the module is translated.
- **`villa-booking`'s `src/types/database.types.ts` is stale** for
  `check_occupancy` and `create_booking_atomic` after migration 00108. Its own
  `rpc()` callers pass named arguments, so nothing breaks today; regenerate it
  in that repo.
- **`CREATE INDEX` in 00108 is not `CONCURRENTLY`**, and the `booking_channel`
  check constraint is validated in place rather than `NOT VALID` +
  `VALIDATE CONSTRAINT`. Both take write locks on `bookings` for the length of
  a scan. Deliberate: the table is small and `CONCURRENTLY` cannot run inside
  the migration's transaction. Revisit if that table ever grows.

### Fixed 2026-11-04

- **A failed `ical_feeds` read no longer caches an empty map.** It was cached
  for the full five-minute TTL, so one transient cross-DB error stood in as the
  answer for every read in that window. Worse than the labelling problem first
  logged: channel enrichment writes `channelValueForFeed(block.channelName)`
  into `bookings.booking_channel` and the feed name into the payout receipt, so
  stays enriched during that window were permanently stamped `channel` instead
  of `airbnb`, with a payer name of literally "the channel". A failed read now
  returns an empty map uncached (`lib/villa-db/blocks.ts`).
- **The confirmation code in a block note is now labelled** (`code HM5XK3J9QW`).
  `parseChannelNote` took the first segment matching `^[A-Z0-9]{6,20}$`, and
  segment 0 is the channel's own name — so a feed named `AIRBNB`, `MAKEMYTRIP`
  or `GOIBIBO` was read back as a confirmation code and written into the payout
  receipt's `p_reference`. The parser now prefers the label, and falls back to
  an unlabelled scan that starts past segment 0 so notes written before this
  still read correctly. Covered by `lib/villa/channel-note.test.ts`.
- **`invalidateFeedNamesCache` is gone.** It had no callers and could not have
  any: Ooruda only ever SELECTs `ical_feeds` — feeds are created and renamed on
  the booking site, so there is no local write path to invalidate from. The TTL
  is the policy and the comment now says so. A rename shows the old label for
  up to five minutes.
- **`listBlocks`' 30-second cache no longer breaks the integration test.**
  "refuses to release a block a channel feed owns" deletes the feed through
  `site.client`, bypassing the service, so nothing invalidated the cache and the
  final assertion read the stale list. The test now invalidates after that
  out-of-band write. Production paths were never affected — `createBlock` and
  `releaseFromBlock` both invalidate correctly.


## Void enrichment for channel bookings (raised 2026-11-03)

Hard-deleting a booking is architecturally wrong: orphaned rows in mirror, activity,
guest documents, and payment ledger, plus broken audit trail. The codebase rule
("never DELETE a booking; cancel it §5.5") stays. But Airbnb bookings need an
**undo-enrichment** path the current cancel flow doesn't cover.

### Scenarios this solves
1. **Wrong enrichment** — operator entered wrong guest / wrong amount; no undo today,
   and after check-in even cancel is unavailable.
2. **Platform cancellation** — Airbnb guest cancelled on the platform, iCal block
   vanished, but the enriched booking stays as "confirmed" with no action.
3. **Duplicate / test enrichment** — permanent record today, no cleanup.
4. **Airbnb date change** — old enriched booking has stale dates; new iCal block
   appeared. Need to void old → re-enrich new.

### Design
- New status `voided` (distinct from `cancelled`: "created in error" vs "real booking
  was cancelled").
- **Reverse the auto-recorded payout receipt** — create a reversal entry in the ledger,
  never delete the original.
- Log void in `villa_booking_activity` with mandatory reason.
- Release guest documents for purge.
- **Available regardless of check-in date** — mistakes are discovered late.
- Allow re-enrichment from the same iCal event (existing code already permits
  re-enrichment over cancelled bookings; extend to voided).
- Gate: `villa_admin` only.

### What NOT to do
- No hard delete — audit trail and financial integrity.
- No auto-cancel when iCal block disappears — feed sync can be flaky; "Gone from
  channel" warning with manual action is the right UX.
- No voiding if real check-in records or external payment reconciliations exist.

---

## Editing existing bookings — Phased implementation & Design (raised 2026-11-02)

Comprehensive analysis of updating existing bookings (guest count, pricing, and guest contact details).

### Real-World Use Cases
1. **Guest Count Changes (Extra Guests / Fewer Guests):**
   - *Additions:* A party booked for 8 adults arrives with 10 adults. The villa charges an extra guest fee (e.g. ₹1,500/night/guest) above the included occupancy.
   - *Reductions:* A group booked for 12, but 3 couldn't make it. Manager agrees to drop the extra guest charge before final payment.
2. **Total Price / Commercial Adjustments:**
   - *Discretionary adjustments:* Manager or owner applies a ₹5,000 discount or rounds down the total bill.
   - *Stay extensions:* Guest requests 1 additional night while in-house.
   - *Add-ons & services:* Meals, BBQ, or extra amenities added to the booking invoice.
3. **Guest Contact & Identity Corrections:**
   - Correcting typos in guest's name for GST invoice / police verification.
   - Reassigning primary contact from an assistant/agent to the actual in-house guest.

### Architectural & Accounting Constraints
1. **Direct Bookings vs Airbnb/OTA Bookings:**
   - **Direct:** Ooruda is system of record; prices and counts can be updated directly.
   - **Airbnb/OTA:** Airbnb is merchant of record. Modifying dates/prices in Ooruda causes payout and reporting drift. Date and price alterations must go through Airbnb. Guest counts and contact notes can be updated in Ooruda.
2. **Invoicing & GST:**
   - Modifying `total_amount` after generating an invoice invalidates tax compliance. Adjustments need balance due recalculation or credit/debit adjustment line items.
3. **Audit Trail:**
   - Every change must record `previous` and `updated` values in `villa_booking_activity` with a mandatory reason note.

### Phased Roadmap
- [x] **Phase 1: Basic Guest & Occupancy Updates — DONE 2026-11-04**
  - "Edit booking" dialog (`_components/edit-booking-dialog.tsx`), in the action
    bar on the booking page beside Check in / Check out / Cancel.
  - Editable: salutation, first and last name, phone, email, adults, children,
    infants, special requests. Plus a **required reason**.
  - Writes the booking site first (`updateBookingGuestDetails`, which also keeps
    the site's joined `guest_name` column in step with the name parts), then
    `villa_bookings_mirror`, then the activity entry.
  - Logs `'booking_updated'` with the reason and a field-level diff
    (`describeBookingChanges`). Migration
    `20261104120000_villa_booking_updated_activity.sql` widens the action check
    constraint; constraint-only, so no typegen.
  - **Who:** `villa_admin` and `villa_manager` — correcting who is staying is a
    front-desk job, not a money one.
  - **When:** `confirmed` or `completed` only, enforced in the service AND in
    the site `UPDATE`'s own `.in('status', …)`. Deliberately still editable
    after check-out: a misspelt name is found when the invoice or the police
    verification is written, which is after the stay. A `cancelled` or
    `expired` booking is a record of something that did not happen.
  - **The guest-count guard** (`lib/villa/booking-edit.ts`, unit-tested) is the
    one place Phase 1 touches money, and it declines rather than lie:
    - over `max_occupancy` → refused, for channel stays too (Airbnb owns the
      money, not the fire regulations);
    - a change that crosses `base_occupancy`, so the extra-guest charge the
      stay was priced on is no longer the right one → refused for **direct**
      bookings, with a message naming the old and new counts. Saving the count
      alone would record ten guests at an eight-guest price and leave Reports,
      the invoice and the balance due all understating it. **This is the
      boundary Phase 2 removes** — the doc's own "booked for 8, ten arrive"
      case needs the charge adjusting, which is Phase 2.
    - **channel-sold stays are exempt** from that second rule: the channel has
      already charged the guest, so the counts are ours to correct while the
      money is not ours to restate;
    - infants are never capped and never charged, so they always edit freely.
  - Phone round-trips deliberately: the site holds Indian mobiles as bare 10
    digits, `PhoneInput` takes E.164 and renders an empty field for anything it
    cannot parse — so seeding it raw showed no number and saving would have
    wiped it. Normalised into the form, `toSitePhone` on the way back, and the
    diff compares in site form so a formatting difference is not reported as a
    change of number.
  - Phone and email are optional here (unlike the new-booking form): a stay a
    channel sold often has neither, and an edit must not force staff to invent
    one to fix a spelling. Both still validated when given.
- [ ] **Phase 2: Financial Adjustments & Balance Recalculation**
  - Allow adjusting Extra Guest charges or adding an explicit line-item discount/surcharge.
  - Dynamically recalculate GST and balance due (`total_amount - payments_recorded = balance_due`).
  - Restrict total price reduction below already recorded payments (prevent negative balance without explicit refund).
- [ ] **Phase 3: Date Alterations & Stay Extensions**
  - Date changes with real-time atomic availability & block check.

