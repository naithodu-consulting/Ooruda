# Ooruda Villa — open items for review

Everything waiting on a decision or an action from you, in one place. Tick an item when done;
add the date. Engineering detail lives in `OORUDA_VILLA_TODO.md` (this repo) and the
villa-booking repo's `TODO.md`; this file is the checklist.

Last updated: 2026-09-30 (after M8a).

---

## A. Before anything reaches production

- [ ] **Push the villa migrations to the dev database** (Ooruda Development,
      `bcdosjrbkkemsqowhigj`). Applied locally only so far. You said "not yet" earlier.
      Pending: M0–M6 villa migrations (`20260927110925` … `20260930003722`).
      Command: `cd apps/web && supabase migration list --linked`, then `./scripts/db-push.sh`.
- [ ] **Privacy Policy wording** — new section 5 "Villa Guests and Identity Documents" on
      ooruda.com (`app/[locale]/(legal)/privacy-policy/page.tsx`). Drafted by engineering;
      needs a legal read before production.
- [ ] **Business details** — enter the villa's legal name and GSTIN in Villa Settings >
      Policies; they print on receipt vouchers (and later on tax invoices).
- [ ] **CA confirmation of the GST slabs** — SAC 996311; 5% up to ₹7,500 per unit per day,
      18% above (plan §9). Blocks tax invoices (M5b).

## B. Switches that are built but off

- [ ] **Guest ID photo storage** — set `VILLA_GUEST_ID_UPLOADS=true` in the app's environment
      **only after** the booking site's Privacy page states ID storage and the 30-day
      retention (villa-booking TODO 7). Until then staff record IDs "seen in person" (last 4
      digits only).
- [ ] **Scheduled job** — `GET /api/villa/sync` with `Authorization: Bearer $CRON_SECRET`
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

---

## Done

- 2026-09-30 — M0–M7 and M8a built and committed on `villa-v1.0` (not pushed).
