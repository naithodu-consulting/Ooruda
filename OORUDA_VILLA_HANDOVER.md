# Ooruda Villa — handover: what is pending and how to pick it up

Written 2026-11-05, at the end of a cloud session that shipped five commits to
`release`. It exists because that session could **not** reach either Supabase
project and had no local Docker, so nothing it wrote has ever been executed
against a real database.

Read this top to bottom before touching anything. Section 1 is a hard
prerequisite for everything else.

**Audience:** whoever continues this — a person or another model. Where a
decision was taken deliberately, the reasoning is recorded so it is not
undone by accident.

---

## 0b. Session of 2026-11-05/06 — what changed since this was written

| Was | Now |
|---|---|
| §1 three migrations unapplied | **Applied** to local and dev. §1 notes a wrong comment in `20261105140000` (its `SET LOCAL` had no effect: the CLI does not wrap migrations in a transaction) |
| §2 nothing runtime-tested | **All of it tested and passing** on the local stack. Two findings: 2a.4's premise is impossible, and Reports' NET RECEIVED is not cash received |
| §3 advisory lock owed | **Partly done.** The lock it proposed cannot work as written; what was achievable is shipped and the rest is now an architecture decision |
| §7 scheduler | **Done, shipped inert.** pg_cron job every 15 minutes, switched on by two database settings that were deliberately not set |
| — | Separately: iCal conflict alerts no longer repeat every sync (an operator had nine copies of one alert) |

Still untouched: §4 (blocked on villa-booking), §6 (invoice on demand), and
the rest of §7.

---

## 0. What was shipped, and where it stands

On `release`, newest first:

| Commit | What |
|---|---|
| `4e40d0f` | Adjust a booking's amount (edit booking Phase 2) |
| `5cd5ad0` | Void a channel enrichment, money included |
| `3b71860` | Edit an existing booking's guest details (Phase 1) |
| `cbe524c` | Part-paid refund ladder: never promise more than was received |
| `c9fac08` | Channel enrichment data-integrity fixes |

Verified in the cloud session: **409 unit tests passing**, `pnpm typecheck`
clean across 33 packages, `lint:fix` and `format:fix` clean.

**Not verified by anyone:** every two-database write path listed above. See §2.

---

## 1. APPLY THREE MIGRATIONS — ✅ DONE 2026-11-05

**All three are applied to Dev (`bcdosjrbkkemsqowhigj`).** Verified with
`supabase migration list --linked`: `20261104120000`, `20261105090000` and
`20261105140000` all show in the Remote column.

Two notes from the push:

- `20261105140000` emitted `WARNING (25P01): SET LOCAL can only be used in
  transaction blocks`. The CLI did **not** wrap that file in a transaction, so
  its `lock_timeout = '5s'` had no effect and the comment claiming "the whole
  file runs in one transaction (Supabase CLI)" is wrong. It applied fine at
  today's table size, but a future migration wanting a real lock timeout must
  open its own `BEGIN`.
- The three constraint swaps are **stacked** — each restates the full action
  list — so they must always be applied in timestamp order, and any later
  migration touching `villa_booking_activity_action_check` must carry all of
  `booking_updated`, `enrichment_voided` and `amount_adjusted` forward.

The original instructions are kept below for reference.

### Original instructions

`release` auto-deploys to `ooruda.vercel.app` against the **Dev** Supabase
project (`DEPLOYMENT.md:75`). The code is therefore already live while these
migrations are not applied.

```bash
cd apps/web && supabase link --project-ref bcdosjrbkkemsqowhigj
cd apps/web && supabase migration list --linked
./scripts/db-push.sh
```

Exactly three rows should show a blank **Remote** column:

| Migration | Adds |
|---|---|
| `20261104120000_villa_booking_updated_activity.sql` | `booking_updated` |
| `20261105090000_villa_enrichment_voided_activity.sql` | `enrichment_voided` |
| `20261105140000_villa_amount_adjusted_activity.sql` | `amount_adjusted` |

All three are check-constraint swaps on `villa_booking_activity.action`. No
column changes, so **no `supabase:web:typegen` run is needed** — `action` is
already `text`.

### Why the delay matters, and why it is not an emergency

`recordBookingActivity` (`apps/web/lib/villa/activity.ts`) deliberately
swallows insert failures so an audit write never fails a completed business
action. So until these land, the three new actions still **do** their work —
the booking is edited, the stay is voided, the amount is adjusted — but the
activity row fails the constraint and is lost, taking the operator's reason
with it. There is no resync that reconstructs a reason.

It is visible rather than silent: `recordBookingActivity` now returns whether
the row landed, and each of the three features surfaces a warning toast when it
did not. Still, apply the migrations promptly.

**NEVER run `supabase db push --linked` directly** — always `./scripts/db-push.sh`
(`CLAUDE.md`). It refuses any project that is not Dev or Prod and blocks Prod
without `--production`.

---

## 2. RUNTIME-TESTED 2026-11-06 — all of it, against local

Done on the local stack (Ooruda on 127.0.0.1:54321, the booking site on
127.0.0.1:54331, both real databases), driving the real screens as
`villa_admin`. **Every scenario below passed.** Four things worth keeping:

| § | Scenario | Result |
|---|---|---|
| 2a.1 | Booking with only `guest_name` | PASS — split shown as Ramesh / Kumar Nair, `guest_name` intact after save, parts backfilled |
| 2a.2 | Two tabs, compare-and-set | PASS — second save refused, dialog kept the operator's input |
| 2a.3 | 8 → 10 adults, direct | PASS — refused, with the figures in the message |
| 2a.3 | 8 → 10 adults, channel-sold | PASS — allowed, amount untouched |
| 2a.4 | Off-list salutation | **PREMISE WRONG** — see below |
| 2a.5 | Indian mobile survives an unrelated edit | PASS |
| 2b.1 | Void a COMPLETED channel stay | PASS — the case that was broken: cancelled, `payment_status` → unpaid, receipt voided, `enrichment_voided` logged |
| 2b.2 | Money reversed | PASS — payout receipt voided, commission expense removed (count went to 0) |
| 2b.3 | Payout leaves Reports | PASS — cancelled stays are excluded from booking value and the expense is gone. **But see the NET RECEIVED finding below** |
| 2b.4 | Re-enrich the same iCal event | PASS — the block returns under "In house" as "Add booking details", and a new booking was recorded on it |
| 2b.5 | Direct booking offers no void | PASS |
| 2c.1 | Raise the total | PASS — 20,000 + 2,000 − 1,000 = 21,000 taxable, GST 3,780, total 24,780, balance 14,780, all to the paisa |
| 2c.2 | Below money received | PASS — refused client-side, Save disabled |
| 2c.3 | **The race** | PASS — a receipt banked behind the open dialog was caught server-side with exact figures, and the stored figures were left untouched |
| 2c.4 | Clear the stay charge | PASS — no ₹0 preview, Save disabled |
| 2c.5 | Invoiced / channel-sold | PASS — no Adjust control on either |
| 2c.6 | List shows the new total at once | PASS — the 30-second cache is invalidated |
| 2d.1 | Part-paid refund ladder | PASS — ₹10,000 of ₹54,280 gives ₹10,000 / ₹0 / ₹0; fully paid still ₹54,280 / ₹27,140 / ₹0; nothing received gives no ladder |
| 2d.2 | Nothing received is held back | PASS — and visibly: "Enabled once a payment is recorded.", no Send button |
| 2d.3 | Channel notes and payout reference | PASS — `Airbnb · booking · HM5XK3J9QW · phone ending 4821`, and the receipt reference is the confirmation code, not the feed name |
| 2d.4 | Feed rename picked up | PASS — showed as "Airbnb Renamed" after the TTL |

### 2a.4's premise is wrong — there can be no 'Dr'

The booking site has `bookings_guest_salutation_check`, which allows only
`Mr`, `Mrs`, `Ms` or null. Ooruda's own `SALUTATIONS` is the same three, so
the two agree and a 'Dr' booking cannot exist to be preserved. The
`UpdateBookingSchema` comment about keeping 'Dr', 'Miss' or 'Shri' describes
data the site will not store.

Tested the equivalent risk instead — a booking with salutation NULL — and it
stayed NULL rather than defaulting to 'Mr'. The defensive code is harmless;
the scenario as written is untestable.

### Finding: the Reports "NET RECEIVED" tile is not money received

`netReceived` in `lib/villa/reports.ts` is `gross booking value − expenses`.
It never reads the receipts ledger. With live receipts of ₹1,95,200 the tile
read ₹2,59,620, which is the booking value: it counts unpaid and part-paid
stays as received. The sub-label says "Net Booking amount", but the tile
title and the Monthly Performance column both say NET RECEIVED, and an
operator will read that as cash in the bank.

Not caused by any of the five commits.

**Analysed 2026-11-06, on the question of removing the tile outright.**

The overview already shows **Total Booking Value** and **Total Expenses** as
their own tiles, and `netReceived` is exactly the first minus the second. So
the tile carries **no information the page is not already showing** — it
contributes only a name that says something untrue.

Computing what the name promises is not a small change either: the overview
tab does not load receipts at all. `load-report.ts` fetches
`villa_booking_payments` and `villa_refunds` only when the tab is
`payments`, so a true cash figure means a new query on a tab that does not
have one today.

Three options, in order of preference:

1. **Remove it** — the tile, the `NET RECEIVED` column in Monthly
   Performance and in the outlook table, and the matching rows in the PDF and
   CSV exports. Nothing is lost: the two numbers it combines stay side by
   side, and real cash received already has a home on the Payments & Refunds
   tab, which loads the ledger. The sibling `net` field (revenue − expenses,
   excluding GST) is computed and never rendered, so it goes too.
2. **Rename it** to "Booking value less expenses". Honest, but it leaves a
   tile that restates two adjacent tiles.
3. **Make it true cash received** — a new receipts query on the overview.
   Most work, and it would sit oddly beside booking-value measures while
   duplicating the Payments tab.

**The one caveat for removal:** the CSV and PDF exports change shape. Anyone
with a spreadsheet keyed to that column will see it disappear.

The original instructions are kept below.

### Original instructions

## 2. RUNTIME-TEST WHAT WAS BUILT — nobody has

This is the single largest outstanding risk. The cloud session had no Colima,
so `pnpm supabase:web:start` was impossible and the booking-site database was
unreachable. The pure logic has good unit coverage; **the site write, the
mirror upsert, the activity insert and the payment-status resync have never
executed.**

Run these on dev after §1. Each is chosen because it exercises a path that was
either broken once and fixed, or has no test at all.

### 2a. Edit booking (Phase 1)

1. **A booking with only `guest_name` and null name parts.** This is the data-loss
   bug that was found in review: the dialog seeded empty name fields and
   saving rewrote `guest_name`, which is what the GST invoice, the registration
   card and the police verification all read. Verify the dialog shows the real
   name split on the first space, and that saving leaves `guest_name` intact.
   Create the fixture directly on the site DB:
   ```sql
   -- on the villa-booking (site) database, dev
   update bookings
      set guest_name = 'Ramesh Kumar Nair',
          guest_first_name = null,
          guest_last_name  = null
    where id = '<a confirmed direct booking>';
   ```
2. **Two tabs.** Open the edit dialog in both, save in one, then save in the
   other. The second must be refused with "Someone else changed this booking…",
   not silently overwrite. This is the compare-and-set on `updated_at`.
3. **A guest count that crosses the included occupancy** (`base_occupancy`, 8 on
   Villa 19): 8 → 10 adults on a *direct* booking must be **refused**. The same
   change on a *channel-sold* stay must be **allowed** (the channel charged the
   guest; the counts are ours to correct, the money is not ours to restate).
4. **A salutation outside Mr/Mrs/Ms.** Set `guest_salutation = 'Dr'` on the site,
   open the dialog, save without touching it — it must stay `Dr`, not become
   `Mr`.
5. **An Indian mobile.** The site stores 10 digits, the app uses E.164. Verify
   the dialog shows the number (not an empty field), and that saving an
   unrelated field does not blank it.

### 2b. Void enrichment

1. **A COMPLETED channel stay.** This is the case that was broken: money was
   reversed, the stay stayed completed, and no activity row was written, and a
   retry could not mend it. Verify the whole thing now succeeds.
2. Check the payout receipt is voided (`villa_booking_payments.voided_at`), the
   commission expense is gone from `villa_expenses`, the stay is `cancelled` on
   the site, and `payment_status` is no longer `paid`.
3. **Confirm the payout left Reports.** Villa Reports → Payments tab, and the
   revenue figure.
4. **Re-enrich the same iCal event afterwards.** It must be possible. This is why
   the site status is `cancelled` and not a new `voided` — see §5.
5. A direct booking must offer no "Void enrichment" button at all.

### 2c. Adjust amount (Phase 2)

1. **Raise the total**, verify GST recomputes at 18% of (stay + extra − discount)
   and the balance due moves.
2. **Try to drop the total below money already received** — must be refused both
   client-side (button disabled) and server-side.
3. **The race.** Open the adjust dialog, then in another tab record a payment that
   exceeds the total you are about to set, then save. The adjustment must be
   refused *and the figures left unchanged* — this is the post-write
   verification described in §3.
4. **Clear the stay-charge field and try to save.** Must be refused, not saved as
   ₹0. (It saved as zero before review.)
5. **An invoiced booking** must offer no adjust control; a channel-sold one
   likewise.
6. **Check the bookings list** immediately after a successful adjustment — the new
   total must appear at once. There is a 30-second in-process cache that was
   not being invalidated.

### 2d. The refund ladder and the channel fixes

Equally untested, and both touch things a guest or an accountant sees.

1. **A part-paid confirmation e-mail.** Record a part payment on a direct booking
   (say ₹10,000 against a ₹54,280 stay) and send the booking confirmation. The
   cancellation table must show the advance as refundable in the top tier and
   "no refund" below it — never the full stay value. Compare a fully paid
   booking's e-mail against one sent before this change: it must be **identical**.
2. **A booking with nothing received** must be held back entirely
   ("Record the advance payment first…"), not sent with a ladder.
3. **Channel block notes.** After an iCal sync, check a block's note now reads
   `Airbnb · booking · code HM5XK3J9QW · phone ending 4821`. Then check the
   payout receipt's reference on a newly enriched stay carries the confirmation
   code and **not** the feed's name.
4. **Rename an iCal feed on the booking site** and confirm Ooruda picks up the
   new channel name within five minutes (the cache TTL — there is no
   invalidation, by design, because Ooruda never writes `ical_feeds`).

---

## 3. PARTLY DONE 2026-11-06 — the advisory lock on the payments path

**Shipped** (`20261105180000_villa_payment_advisory_lock.sql`, applied to local
and dev):

- `record_villa_payment` takes `pg_advisory_xact_lock` on the booking, so two
  receipts for one booking cannot interleave.
- `villa_booking_receipts_snapshot` reads receipts and refunds in one
  transaction under the same lock, and `adjustMoney`'s post-write
  verification uses it.
- `villa_booking_lock_key` is the one place the lock key is derived.

**The fix proposed below does not work as written, and this is why.** It says
to hold the lock across "the ledger read plus the site write". That is not
possible: the site write goes to a different Postgres instance, and PostgREST
gives each call its own transaction, so no lock taken in Ooruda can still be
held while the booking site is written. The quantity being guarded also spans
both databases — money received is Ooruda's receipts **plus** the site's
online Razorpay payments, and the total being compared against is the site's.

What that proposal was really worth was found on the way: the old verification
read receipts and refunds through separate calls and could see a payment
without the refund that cancelled it. That torn read is now closed, and the
receipt path is serialised against itself.

**What remains open, in plain terms.**

The rule being protected is: *a booking's total must never be moved below the
money already taken for it* — otherwise the guest is owed money that no
refund record exists for, and nothing will ever surface it.

Checking that rule needs two facts that live in two different databases:

| Fact | Where it lives |
|---|---|
| The booking's total | the booking **site**'s `bookings` row |
| Money received | **Ooruda**'s `villa_booking_payments`, **plus** the site's own online Razorpay payments |

To make the check airtight, the read and the write must happen inside one
transaction. Two separate Postgres instances, each reached over PostgREST
where every call is its own transaction, cannot provide one. So the sequence
is unavoidably: read the money, decide, write the total — with a gap.

What happens in that gap today: a receipt banked after the verification read
is missed, so the adjustment stands even though it is now below the money
taken. The compensating write in `adjustMoney` is the backstop — it re-reads
and puts the old figures back — but it cannot catch a payment that lands
after *it* has read either.

**How likely is it?** It needs two people acting within the same second or
two — one adjusting an amount while another banks a payment on the same
booking. For a single villa with one or two admins this is rare. It is not
rare enough to ignore for ever, because the failure is silent: nothing warns
anybody, and the discrepancy only shows up when the books are reconciled.

**The two ways to close it, and the trade:**

1. **Move the booking total into Ooruda's database** (mirror it as the
   authority for money, leaving the site's copy for display). Then total and
   receipts share one database, one transaction and one lock, and the guard
   becomes a plain assertion. Clean, and the bigger change: it moves where
   the truth about money lives.
2. **A two-phase protocol with the booking site** — claim the adjustment,
   confirm it, roll back on failure. No change to where data lives, but it
   adds a distributed-transaction shape to every amount change, which is
   more moving parts to get wrong than the problem it solves.

My reading is that (1) is the right one whenever this is picked up, because
Ooruda already owns receipts, refunds, expenses and the activity log — the
total is the odd one out. But it is a decision about ownership of data, not a
patch, which is why it was not taken here.
Closing it properly needs a decision rather than a patch: either move the
booking total into Ooruda's database so total and receipts share a
transaction, or run a two-phase protocol with the booking site. That is an
architecture call for the owner, not a migration.

The original text is kept below, because its reasoning about the race itself
is still correct.

### Original text

## 3. OWED: an advisory lock on the payments path

**Priority: do this before Phase 2 is used in earnest.**

Phase 2's "never adjust below money received" guard is a read-then-write, and
the compare-and-set on the site's `updated_at` **cannot** close the gap:
receipts live in Ooruda's `villa_booking_payments`, and `record_villa_payment`
never touches the site's `bookings` row. A payment banked between the ledger
read and the site write therefore leaves the CAS value unchanged and the write
succeeds. One admin in two tabs is enough to drop a total below the money
received, which is a refund with no record of it.

**What is in place now** (`adjustMoney` in
`apps/web/app/[locale]/home/[account]/bookings/_lib/server/bookings.service.ts`):
after the write, the ledger is re-read against the figures that actually
landed, and the previous figures are written back if the guard no longer holds.
That is a compensating action, not serialisation — if the restore itself fails
it logs loudly and the booking is left below its receipts for a person to sort
out.

**The proper fix:** take a `pg_advisory_xact_lock(hashtextextended(site_booking_id, 0))`
in Ooruda for the span of the ledger read plus the site write, and have
`record_villa_payment` take the same lock. That serialises adjustment against
receipt properly. It needs a migration on the payments path, which is why it
was not done in the same change.

When it lands, the compensating write in `adjustMoney` can be simplified to a
plain assertion.

---

## 4. BLOCKED: Phase 3 — date changes — explained 2026-11-06

**What the change is.** Letting an operator move a booking's check-in /
check-out — a guest asking for 12-13 Nov instead of 10-11 Nov. Today the
edit dialog says in as many words that "Dates and amounts cannot be changed
here", so the only way is to cancel and re-book, which loses the booking
code, the receipts and the history.

**Why it cannot be built from Ooruda alone.** Verified against the booking
site's own schema on 2026-11-06, the site offers exactly three relevant
functions and no fourth:

| Function | What it does |
|---|---|
| `check_availability(property, in, out)` | Answers yes/no for a date span |
| `create_booking_atomic(property, …, in, out, …)` | Checks availability and creates the booking in one statement |
| `get_unavailable_nights(property, from, to)` | Lists nights already taken |

There is **no** "move this booking's dates" function, and nothing that
releases one span and claims another in a single statement.

**Why release-then-rebook is the wrong answer.** It is two statements with a
gap between them:

1. cancel / release 10-11 Nov
2. create the booking on 12-13 Nov

Between (1) and (2) the villa is for sale on both the public website and
Airbnb. The website can sell those nights, or an iCal sync can import an
Airbnb block onto them. Then step (2) fails and **the guest has no booking at
all** — their original nights are gone and the new ones belong to someone
else. There is no way back: the original span may itself have been taken in
the same gap.

The window is small and the failure is total, which is the worst shape of
risk for a booking system.

**What unblocks it.** An atomic move on the booking site — one statement that
releases the old span and claims the new one, or fails leaving the booking
exactly as it was. This is already on villa-booking's own TODO as **item 8b,
"atomic block / release functions"**. It is that repo's call to design, since
only it owns the availability tables.

**Scope once unblocked** (Ooruda side, for estimating): the dialog gains two
date fields; the service re-prices the new span through the same rate card
and refuses when the new dates cross the GST slab or the stay has been
invoiced; the activity log gains a `dates_changed` action with its own
constraint migration; and the guest emails need re-sending or a "your dates
changed" template.

### Original text

## 4. BLOCKED: Phase 3 — date changes

Needs a new RPC in the **villa-booking** repo. Not an Ooruda-side decision.

`check_availability` and `create_booking_atomic` are whole-property, and there
is no "move these dates" function. Doing it as release-then-rebook is **not
atomic**: between the two steps the nights can be sold by the website or taken
by an iCal sync, and the stay is lost with no way back. Do not implement it
that way.

This is already on villa-booking's own TODO as **item 8b, "atomic block /
release functions."** Phase 3 should wait for it.

---

## 5. Decisions taken deliberately — please do not reverse without reading

Each of these looks like a shortcut and is not.

### 5a. Void enrichment uses `cancelled`, NOT a new `voided` status

The original design in `OORUDA_VILLA_TODO.md` called for a `voided` status. It
cannot work. villa-booking's `bookings_channel_event_unique` partial index
(its `00108`, lines 80-84) excludes only `status <> 'cancelled'`:

```sql
CREATE UNIQUE INDEX bookings_channel_event_unique
  ON bookings (property_id, source_feed_id, source_external_uid)
  WHERE source_feed_id IS NOT NULL
    AND source_external_uid IS NOT NULL
    AND status <> 'cancelled';
```

A `voided` row stays **inside** that index, so re-enriching the same iCal event
would fail on a duplicate key for ever — the opposite of what voiding is for,
and exactly what that migration's own comment warns about. So the site status
stays `cancelled` and the "created in error" distinction lives in Ooruda's
`villa_booking_activity` instead.

To get a real `voided` status, widen that index predicate in villa-booking
first (`status NOT IN ('cancelled','voided')`). Until then, leave it.

### 5b. Void enrichment cancels the stay FIRST, and nothing after it throws

Reversing the money first looked safer and was not: `cancelBooking` matches
only `confirmed` rows, so a *completed* stay had its receipt voided and its
commission expense deleted and then threw — money gone, stay still completed,
**no activity row at all**, and unfixable by retry because the receipt no
longer matched `voided_at is null`.

Now the one step that can legitimately fail does so before anything is
destroyed. Its worst case is a cancelled stay whose payout is still counted,
which is simply the pre-feature behaviour and is fixable from the Payments
panel. Do not reorder this.

### 5c. Phase 1 refuses guest-count changes that cross `base_occupancy`

Not an oversight. Saving the count alone would record (say) ten guests at an
eight-guest price, and Reports, the invoice and the balance due would all
understate it. Phase 2 is the unlock — once the amount can be adjusted, the
count and the charge can move together. The guard also reads the booking's
**own** recorded `extra_guest_amount`, not just the live rate card, so a
preferential-price stay (which records no extras whatever the headcount) may
correct its count freely.

### 5d. Phase 2 refuses invoiced bookings

A GST invoice is auto-issued by a trigger on the site the moment a direct
booking becomes confirmed + paid. Changing the amount afterwards needs a
credit or debit note, which Ooruda cannot issue until M5b. Refusing beats
issuing a wrong tax document. §6 makes this almost never bite.

### 5e. Phase 2 refuses under the per-night GST slab

The slab picks 5% or 18% per unit per night from that night's own charge, so a
stay whose nights are priced differently has no single answer, and averaging
the total across nights lands on the wrong side of the ₹7,500 ceiling for some
of them. `adjustmentsAvailable()` gates the UI and the service together, so
flipping `TAX_MODE` hides the control rather than producing wrong tax. If the
slab is ever switched on, Phase 2 needs per-night figures, which the form does
not collect.

### 5f. The part-paid refund ladder charges on stay value, nets against receipts

Settled with the owner on 2026-11-04:

```
charge = stay value − round(stay value × refund fraction)
refund = max(0, received − charge)
```

The shortfall is **written off** — no refund and no demand on the guest. A stay
paid in full is arithmetically unchanged to the paise, which is why
villa-booking (all of whose bookings are paid in full) needed no matching
change. The e-mail wording and table layout were deliberately left alone.

---

## 6. NEXT, and worth doing: invoice on demand (item 8c)

The owner's own suggestion, and a good one. Today a trigger auto-issues a GST
invoice the moment a direct booking is confirmed + paid — i.e. at an *advance
payment*, before the amount is final (extra guests, add-ons and extensions are
all settled at check-out). GST already has the right document for money taken
before the supply: a **receipt voucher**, which Ooruda issues. The tax invoice
belongs with the supply.

**Do NOT simply move the trigger to fire at `status = 'completed'`.** Issuance
is already treated as the point of no return elsewhere: Ooruda offers "undo
check-out" only while `invoice_number IS NULL`
(`bookings/_components/guest-emails-section.tsx`). Firing at completion would
make every completed stay instantly un-undoable. Issuance has to be a separate,
deliberate act — which is also the only version that guarantees the contents
are final before the number is spent.

### Two paired pieces, in this order

1. **Ooruda: an "Issue tax invoice" action** on a completed direct booking,
   `villa_admin` only. `allocate_invoice_number` is already granted to
   `service_role`, which is how Ooruda connects, so no new site function is
   strictly required — but the RPC below does allocate-and-stamp in one
   statement, which beats two round trips that can half-fail.
2. **villa-booking: `00112_invoice_on_demand.sql`**, drafted in Appendix A.
   Drops the auto-issuing trigger and adds `issue_booking_invoice()`.

**Order matters: ship the Ooruda action first, then apply the migration.**
Applying the migration alone means no invoice is ever issued, because nothing
calls the allocator.

**Caution:** `allocate_invoice_number` draws from a gapless per-property,
per-financial-year series and, as `00038` says, *nothing un-allocates a number*.
So this is forward-looking only — every direct booking already confirmed + paid
keeps the invoice it has. Count them before applying:

```sql
-- on the villa-booking (site) database
select count(*) from bookings
 where invoice_number is not null and status <> 'completed';
```

---

## 7. Smaller pending items, in rough priority order

| Item | Where | Note |
|---|---|---|
| **Itemised add-ons on a booking** | needs a new table | `villa_addons` is a Settings price list with **no booking linkage**; neither DB has `booking_addons`. Phase 2 folds a surcharge into the stay charge instead. Tracked as "Add-on history for invoices" in `OORUDA_VILLA_TODO.md`. |
| **GST on a retained cancellation charge** | ask the CA | Added to `OORUDA_VILLA_OPEN_ITEMS.md` §A. `total_amount` is GST-inclusive, so a retained charge carries a GST component; retention charges are generally taxable in India. Affects how retained money is booked, not the guest e-mail. |
| **Scheduled job for `GET /api/villa/sync`** | `OORUDA_VILLA_OPEN_ITEMS.md` §B | Two of its three jobs genuinely need a scheduler. The guest-ID purge is a **compliance obligation** — the privacy policy states a retention period, and a page view cannot discharge it. |
| **Villa module i18n** | all villa UI | Everything new is hard-coded English, consistent with the rest of the module. Move to `villa.json` when the module is translated. |
| **`loadChannelStays` helper** | 3 pages | Block/booking pairing is assembled in bookings, calendar and blocked-dates. |
| **Share the "statuses that still hold nights" pair** | `lib/villa/constants.ts` | Written out 4×, twice in SQL. |
| **One source of truth for roles** | 6+ places plus the DB | Deferred from the M0 review. |

Non-villa backlog lives in `TODO.md` — the notable ones are the `assoc_admin`
personal bill view (blocked on merging `week-4`), the Razorpay partial-refund
webhook idempotency gap, and the SEO work.

---

## 8. Working notes for whoever picks this up

- **`CLAUDE.md` forbids running any git command without explicit permission.**
  Ask first.
- **No `Co-Authored-By` trailers and no model references** in commit messages.
- **Default branch is `main`; this work is on `release`** (dev/staging). When
  told to push to a branch, touch only that branch.
- **`release` auto-deploys.** Sequence every migration before its code deploy.
- `pnpm format:fix` (oxfmt) reflows code, so a string match written before it
  runs may not match after. Verify after formatting, and re-run the tests —
  the formatter touched test files more than once in this session.
- **A cloud session cannot reach either Supabase project** unless
  `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are added as environment
  variables in the cloud environment's settings. Note that ooruda's
  `db-push.sh` has **no** non-interactive guard on the dev path (villa-booking's
  does), so a cloud session *can* push to Ooruda dev once credentials exist.
  That asymmetry is itself worth a look.
- **Someone pushed to `release` mid-session** (`8abef6c`) and a push was
  rejected as non-fast-forward. It was rebased, not forced, and a docs conflict
  was resolved in favour of the newer state. Fetch before assuming you are
  up to date.
- The `/reviewer` skill earned its keep: it found a real defect in **every one**
  of the three features in this session, including one that destroyed money with
  no audit trail. Run it before committing anything on these paths.

---

## Appendix A — villa-booking `00112_invoice_on_demand.sql` (DRAFT)

Create this in the **villa-booking** repo at
`supabase/migrations/00112_invoice_on_demand.sql`. It was written from the
Ooruda side and has **not** been applied or reviewed by anyone who owns that
repo. Read §6 before applying — it must not be applied alone.

```sql
-- See §6 of OORUDA_VILLA_HANDOVER.md. DO NOT APPLY ALONE: without the
-- Ooruda-side "Issue tax invoice" action, nothing calls the allocator and no
-- invoice is ever issued.

-- 1. Stop the automatic issuance.
DROP TRIGGER IF EXISTS trg_bookings_assign_invoice ON bookings;

COMMENT ON FUNCTION bookings_assign_invoice() IS
  'UNUSED since 00112: the tax invoice is no longer issued automatically on confirmed+paid. Kept so the old trigger can be re-created if needed. Issuance is now on demand via issue_booking_invoice().';

-- 2. Issue on demand, atomically. Idempotent; refuses channel-sold stays
-- (the channel invoiced that supply) and stays that are not yet completed
-- (a tax invoice follows the supply). The invoice DATE is the date of issue,
-- not the check-out date: a gapless series wants its numbers and dates to
-- advance together, and dating a number to a past check-out would put an
-- earlier date on a later number.
CREATE OR REPLACE FUNCTION issue_booking_invoice(p_booking_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today    DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_booking  public.bookings;
  v_number   TEXT;
BEGIN
  -- Locked: two operators pressing "issue" at once must not spend two numbers.
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id;
  END IF;

  IF v_booking.invoice_number IS NOT NULL THEN
    RETURN v_booking.invoice_number;
  END IF;

  IF v_booking.source_feed_id IS NOT NULL THEN
    RAISE EXCEPTION
      'CHANNEL_SOLD: % was sold by a channel, which invoiced the guest itself',
      p_booking_id;
  END IF;

  IF v_booking.status <> 'completed' THEN
    RAISE EXCEPTION
      'NOT_COMPLETED: % is %, and a tax invoice follows the supply',
      p_booking_id, v_booking.status;
  END IF;

  v_number := public.allocate_invoice_number(v_booking.property_id, v_today);

  UPDATE public.bookings
     SET invoice_number = v_number,
         invoice_date   = v_today,
         updated_at     = now()
   WHERE id = p_booking_id;

  RETURN v_number;
END;
$$;

COMMENT ON FUNCTION issue_booking_invoice(UUID) IS
  'Allocates and stamps a GST invoice number for a COMPLETED direct booking, on demand. Idempotent. Refuses channel-sold stays and stays that are not completed.';

REVOKE ALL ON FUNCTION issue_booking_invoice(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION issue_booking_invoice(UUID) TO service_role;
```
