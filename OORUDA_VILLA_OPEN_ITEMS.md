# Ooruda Villa — open items for review

Everything waiting on a decision or an action from you, in one place. Tick an item when done;
add the date. Engineering detail lives in `OORUDA_VILLA_TODO.md` (this repo) and the
villa-booking repo's `TODO.md`; this file is the checklist.

Last updated: **2026-11-04** (re-checked against `release` b4e4d307; previously 2026-09-30
after M8a). Items the code could answer were corrected in that pass, and one new item was
found — A0 below, listed first because it inverts a safety assumption this checklist made.

---

## A0. The guest-ID switch fails OPEN (found 2026-11-04)

- [ ] **`VILLA_GUEST_ID_UPLOADS` is on unless explicitly set to `false`**, which is the
      opposite of what this checklist assumed. `lib/villa/flags.ts:10` reads
      `process.env.VILLA_GUEST_ID_UPLOADS !== 'false'`, so **any** environment that does not
      set the variable at all has ID-file storage **enabled**. Its own docstring two lines
      above says storage is "switched on only once BOTH privacy notices say so", and the B
      entry below used to read "set it to true only after ..." (now corrected). The code
      implements neither.
      Compare `manualGuestEmailsEnabled()` directly underneath, which correctly fails closed
      with `=== 'true'` — so the two flags in the same file disagree about which way to fail.
      It is enforced consistently once read (`guests.service.ts:258, 379`,
      `api/villa/guest-documents/route.ts:42`), so the gate works; it just defaults the wrong
      way. `apps/web/.env.local:95` sets it to `true` locally, so local behaviour is
      deliberate — the exposure is any deployed environment where nobody set it.
      **Why it matters together with A and C:** guest ID files can be stored today, while
      the guest-facing privacy page is still placeholder text (villa-booking TODO,
      "Content"), and the retention purge has no scheduler (B below). That is the whole
      compliance chain unmet at once.
      **Fix:** flip the default to `=== 'true'` so it matches its docstring and its
      neighbour, then set it explicitly in each environment that should have it on.

## A. Before anything reaches production

- [x] **Push the villa migrations to the dev database** (Ooruda Development,
      `bcdosjrbkkemsqowhigj`). All 11 villa migrations (M0–M8 + business details)
      applied 2026-10-03; villa-booking `00062_discount_codes.sql` pushed to its dev
      project (`hlmqcdzazbrztfovixjk`) the same day, with the old 15-argument
      `create_booking_atomic` overload confirmed dropped.
- [x] **A discount now reaches Ooruda's revenue figures.** (Found and fixed
      2026-10-03.) `discount_amount` is carried from the booking site through
      `SiteBooking` into a new `villa_bookings_mirror.discount_amount` column
      (migration `20261003175415`), and Reports and the dashboard compute revenue
      as `base_amount + extra_guest_amount - discount_amount`, pro-rated with the
      rest of the money across period boundaries. Unit tests cover both.
- [x] **GST is charged on the discounted value.** (Settled 2026-10-03: the
      discount applies *before* GST.) The booking site re-prices a discounted stay
      through `applyDiscount` in `pricing-engine.ts`, so the discount comes off the
      taxable value and GST follows it; `bookings.total_amount` now records the
      amount actually payable, which also makes the webhook's refund fallback
      correct. The checkout shows the reduced GST, and the summary lists the
      discount above the GST line so the arithmetic reads in order. This matches
      what `apps/web/lib/villa/gst.ts` already documented on the Ooruda side.
      Still open: the CA's confirmation of the SAC 996311 slab thresholds below —
      the booking site charges a flat 18%, so if a discount should ever move a
      night into the 5% band, that is a further change.
- [ ] **Privacy Policy wording** — new section 5 "Villa Guests and Identity Documents" on
      ooruda.com (`app/[locale]/(legal)/privacy-policy/page.tsx`). Drafted by engineering;
      needs a legal read before production.
      The section is live in the app (`privacy-policy/page.tsx:64`), so only the legal read
      is outstanding. Note this is **Ooruda's** notice; the **guest site's** privacy page is
      a separate, still-placeholder page in the villa-booking repo, and A0 depends on it.
- [ ] **Business details** — enter the villa's legal name and GSTIN in Villa Settings >
      Policies; they print on receipt vouchers (and later on tax invoices).
- [ ] **CA confirmation of the GST slabs** — SAC 996311; 5% up to ₹7,500 per unit per day,
      18% above (plan §9). Blocks tax invoices (M5b).
- [ ] **GST on a retained cancellation charge** — ask the CA in the same breath as the
      slabs above. From 2026-11-04 a cancelled part-paid booking retains the advance up to
      a charge of (1 − refund %) × stay value, and `total_amount` is GST-inclusive, so the
      retained amount carries a GST component. Retention and cancellation charges are
      generally taxable in India, which would mean output GST on what is kept. Affects how
      retained money is booked, not the guest email.

## B. Switches that are built but off

- [ ] **Sending guest emails by hand** — greyed out for everyone (and refused by the server) so no
      email goes out by mistake. Set `VILLA_MANUAL_GUEST_EMAILS=true` in the app's environment to
      switch "Send now" / "Send again" back on. Automatic emails are not affected.
      `flags.ts:20` uses `=== 'true'`, so this one correctly fails closed, and the variable
      is not set in `.env.local`. The part-paid refund-ladder bug that previously blocked
      switching this on was fixed 2026-11-04, so the remaining gate is the D-section set-up
      (sender domain, `VILLA_EMAIL_FROM`, wording review).
- [ ] **Guest ID photo storage** — set `VILLA_GUEST_ID_UPLOADS=false` in every environment
      that should not store ID files, and flip the code default (see **A0**). Storage should
      stay shut until the booking site's Privacy page states ID storage and the 30-day
      retention (villa-booking TODO 7); until then staff record IDs "seen in person" (last 4
      digits only).
- [ ] **Scheduled job — two of its three jobs genuinely need a scheduler, not a page
      visit.** Agreed 2026-10-03 to do this *after* the current work lands.
      **Nothing schedules it today (confirmed 2026-11-04).** There is no `vercel.json`
      anywhere in the repo, and the only `cron.schedule` calls in the migrations are
      `amc-reminders` (`20260820000001`) and the association reminder cron
      (`20260806000002`) — neither touches `/api/villa/sync`. The route exists
      (`app/api/villa/sync/route.ts`) and the purge is reachable from it (`:46`), but it only
      ever runs on a page visit: `purgeExpiredGuestIds` is called from
      `_components/villa-month-kpis.tsx:53` (dashboard) and
      `bookings/_lib/server/bookings.service.ts:217`. Read with **A0** this is a live
      compliance gap, not a future one: storage is on by default and nothing enforces the
      retention promise.
      (a) **Guest ID photo purge is a compliance obligation**, not a convenience: the
      privacy policy states a retention period, and if nobody opens a villa dashboard
      for longer than that, guest ID documents sit past their retention date. A page
      view cannot discharge that. (b) **Guest emails** are time-triggered (arrival at
      10:00 IST, thank-you 3 hours after check-out) and go late or not at all without
      it. (c) The **mirror refresh** can live on page visits — Reports and the
      dashboard now refresh it before they read, and the Bookings list and Calendar
      read the booking site live — but it is coupled to (b), since the route syncs
      first so emails are chosen from fresh data.
      `GET /api/villa/sync` with `Authorization: Bearer $CRON_SECRET`
      (secret ≥ 32 characters). It deletes guest ID photos past their retention date, refreshes
      the bookings copy used by dashboards and reports, and (M7) sends due guest emails.
      Decide how to run it: Vercel Cron (every 15 min needs a paid plan) or Supabase pg_cron +
      pg_net calling the URL (as the association reminders do). Until scheduled, these only
      run when someone opens a villa dashboard. **Needed before guest emails go live:**
      suggested every 15 minutes, so the arrival email goes soon after 10:00 IST and the
      thank-you soon after its 3-hour wait.
- [ ] **Online refunds through Razorpay** — needs the villa's Razorpay API keys, which depends
      on who holds the Razorpay account (the villa owner today). Until then refunds are made in
      the Razorpay dashboard and recorded in Ooruda by hand.

## C. Waiting on the villa-booking repo (see its `TODO.md`)

- [ ] **8c — issue the tax invoice at check-out, not at payment.** Blocks M5b (invoices, credit
      notes) and lets Ooruda show "Paid" on the guest's booking page (held back today, because
      marking paid issues an invoice on the site).
- [ ] **7 — Privacy page: guest ID storage and 30-day retention.** Blocks switching on ID
      photos (B above).
- [ ] **8b — atomic block / release functions** (today Ooruda releases blocks in a fail-safe
      order without a transaction).
- [ ] **8d — `bookings.updated_at` trigger** (lets the bookings copy sync by change instead of
      re-reading a date window).
- [ ] **8e — `properties.whatsapp_number` column** (today the number lives in the site's env,
      so Ooruda keeps its own copy in Villa Settings).
- [ ] **8f — record refunded amounts on `payments`** (a partial refund in the Razorpay
      dashboard is invisible to Ooruda's ledger today).
- [ ] **6 — GST per-night slab in `pricing-engine.ts`** (site charges a flat 18% today; Ooruda
      matches it until both switch together).
- [ ] **1 — discount codes (schema + atomic enforcement).** Blocks M8b: publishing Ooruda's
      approved codes to the site, reading redemptions back, and switching the feature on
      (`NEXT_PUBLIC_VILLA_DISCOUNTS=true`, which needs a rebuild).
- [ ] **9 — contract document updates** as each item above lands.

## D. Email (M7) — set-up needed

- [ ] **Set `VILLA_EMAIL_FROM`** in the app's environment to the booking site's sender
      (`Villa 19 by Habbaa <reservations@habbaa.com>`). While unset, no guest emails go out
      (the booking page says so on a manual send).
- [ ] **Sender domain** — guest emails go out as the booking site's sender
      (`Villa 19 by Habbaa <reservations@habbaa.com>`, the site's `RESEND_FROM_EMAIL`). That
      domain must be **verified in the Resend account Ooruda uses** (or Ooruda is given a
      Resend key for the habbaa account). The site's TODO also plans a move to `habbaa.in` —
      keep both apps on the same address.
- [ ] **Email wording** — review the two templates in `apps/web/lib/villa/guest-emails.ts`
      (arrival: dates, times, booking number, ID reminder, WhatsApp and contacts marked
      "share with guests"; thank-you: thanks and an invitation back). Directions and house
      rules can be added once written.
- [ ] **Local testing note** — `apps/web/.env.local` sends through Resend with a real key.
      Test runs use `.claude/launch.json` (`web-prod-3002`), which overrides it to the local
      mail catcher.

## E. Product decisions still open

- [ ] **Subscription / pricing for villa accounts** (deferred to later, plan §14).
- [x] **Multi-villa accounts** — villa switcher on every villa page (2026-09-30).
- [ ] **Room-level selling** — forward-compatible only (plan §11).

## F. Known issues (not villa-specific)

- [ ] **Add Expense dialog sometimes sticks on "Saving…"** in production builds (association
      expenses; the expense is saved). Pre-existing on `release`; details in `TODO.md`.
      The suspected cause is still in place (`add-expense-dialog.tsx:124` wraps `execute()`
      in `startTransition`); the intermittent symptom was not re-tested on 2026-11-04.

## G. Engineering items still open (reviewed 2026-11-04 after the cloud fixes)

Listed here so the checklist shows them; each is written up in full in
`OORUDA_VILLA_TODO.md`.

- [ ] **No way to undo a channel enrichment.** A wrong entry, a platform-side cancellation, a
      duplicate or an Airbnb date change cannot be reversed: there is no `voided` booking
      status, and after check-in even cancel is unavailable. Needs the status plus a ledger
      reversal of the auto-recorded payout.
- [ ] **Editing a booking, Phases 2 and 3.** Phase 1 (guest details and counts) shipped
      2026-11-04. Phase 2 is the financial half — adjusting the extra-guest charge or adding a
      discount/surcharge with GST and balance recalculated — and Phase 1 deliberately *refuses*
      a count change that crosses `base_occupancy` until it lands. Phase 3 is date changes.
- [ ] **Two refactors, no behaviour at stake.** The block/booking pairing is assembled at five
      call sites, and the "statuses that still hold nights" list is written out four times;
      `constants.ts` is the natural home for the latter.

### Fixed 2026-11-04 (was in this section)

- Part-paid bookings being promised more refund than was received — fixed, with the
  cancellation-charge basis settled and tested. One question went to the CA: GST on the
  retained amount (§A).
- A failed iCal feed read being cached for five minutes, which permanently misfiled channel
  revenue and payout payer names.
- A feed named in capitals being read back as a confirmation code and written into a payout
  receipt reference.
- `invalidateFeedNamesCache` (removed — Ooruda has no local write path to invalidate from) and
  the `listBlocks` cache breaking the integration test.

---

## Done

- 2026-09-30 — M0–M7 and M8a built and committed on `villa-v1.0` (not pushed).
