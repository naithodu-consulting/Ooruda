# Villa release — test plan before `main`

Everything on `release` that is not yet on `main`, as of 2026-11-06. Written
so you can work straight down it; each test says what to do and what counts
as a pass.

**Where to test:** dev (`ooruda.vercel.app`, Dev Supabase). All migrations
listed below are already applied there, **except the two from Phase 3**,
which are not committed yet.

**Sign in as `villa_admin`.** A few controls are admin-only and simply will
not appear otherwise, which is easy to mistake for a bug.

---

## 0. Before you start

| Check | Why |
|---|---|
| You are on dev, not production | Several tests write real rows |
| The villa has at least one **direct** booking that is **not fully paid** | A paid direct booking is auto-invoiced, and invoiced stays refuse both Adjust amount and Change dates |
| You have one **Airbnb-sold** booking | Needed for §3 and the channel guards |
| Do **not** test guest emails on real guest addresses | Sending is live through Resend |

---

## 1. Edit a booking's guest details  (`3b718607`)

Booking page → **Edit booking**.

| # | Do this | Pass looks like |
|---|---|---|
| 1.1 | Open on a booking whose guest has a single-word name | First/last split sensibly, nothing blank |
| 1.2 | Change nothing, add a reason, save | "Booking updated", and the guest's name is **unchanged** on the page |
| 1.3 | Open the same booking in two tabs. Save in one, then save in the other | The second is refused with "Someone else changed this booking…", and your typing is still in the form |
| 1.4 | On a **direct** booking, raise adults from 8 to 10, save | Refused, naming the included occupancy and telling you to record the money first |
| 1.5 | Same change on an **Airbnb** booking | Allowed, and the amount does not move |
| 1.6 | Change only the email, save, reopen | The phone number is still there (not blanked) |
| 1.7 | After any save, open **Activity log** | A "Details updated" entry with your reason and the fields that changed |

---

## 2. Adjust a booking's amount  (`4e40d0f3`)

Booking page → Payments card → **Adjust amount**. Admin only, direct bookings only.

| # | Do this | Pass looks like |
|---|---|---|
| 2.1 | Raise the stay charge; watch the preview | GST is 18% of (stay + extra − discount), and the total and balance update live |
| 2.2 | Set a total **below** what has been received | Inline refusal naming the amount received, and **Save stays disabled** |
| 2.3 | Clear the stay charge entirely | "Fill in all three amounts…", Save disabled — **not** a ₹0 total |
| 2.4 | Save a valid change | "Amount adjusted", and the Amount card shows the new breakdown |
| 2.5 | Go straight to the bookings list | The new total is there **immediately** (no 30-second lag) |
| 2.6 | Open an **invoiced** booking, and an **Airbnb** one | No "Adjust amount" button on either |
| 2.7 | **The race.** Open Adjust in one tab. In another, record a payment bigger than the total you are about to set. Then save the first tab | Refused, naming both figures — and the booking's amounts are **unchanged** afterwards |
| 2.8 | Activity log | "Amount adjusted" with your reason and a rupee-level diff |

---

## 3. Void a channel enrichment  (`5cd5ad0e`)

An Airbnb booking that was filled in by mistake. Booking page → **Void enrichment**.

| # | Do this | Pass looks like |
|---|---|---|
| 3.1 | Open it on a **checked-out / completed** Airbnb stay | The button is offered (there is deliberately no date limit) |
| 3.2 | Void it with a reason | "Stay voided…", status becomes Cancelled, Received drops to ₹0 |
| 3.3 | Check the Payments panel | The payout receipt is voided, not deleted |
| 3.4 | Check **Expenses** | The Airbnb commission expense for that stay is gone |
| 3.5 | Villa Reports → Revenue & Occupancy | The stay's value and its commission have both left the figures |
| 3.6 | Bookings → **In house** / Upcoming | The Airbnb block is back, offering **Add booking details** |
| 3.7 | Re-enter the details on that same block | It saves — re-enriching the same calendar entry must be possible |
| 3.8 | Open a **direct** booking | No "Void enrichment" button |

---

## 4. Part-paid refund ladder  (`cbe524c8`)

**Do not send to a real guest.** Use a test booking with your own address.

| # | Do this | Pass looks like |
|---|---|---|
| 4.1 | A booking with **nothing received**: look at Guest emails | "Enabled once a payment is recorded." and **no Send button** |
| 4.2 | Record a part payment (say ₹10,000 on a ₹54,280 stay), then preview/send the confirmation | The cancellation table offers **the advance** back in the top tier and "no refund" below — never the full stay value |
| 4.3 | A **fully paid** booking's confirmation | Identical to before this change: full value, then half, then nothing |

---

## 5. Channel enrichment data fixes  (`c9fac08d`)

| # | Do this | Pass looks like |
|---|---|---|
| 5.1 | After a sync, open a channel block's note | Reads like `Airbnb · booking · HM5XK3J9QW · phone ending 4821` |
| 5.2 | Enrich a channel stay, then open its payout receipt | The reference is the **Airbnb confirmation code**, not the feed's name |
| 5.3 | Rename the Airbnb feed on the booking site, wait 5 minutes, reload | Ooruda shows the new channel name |

---

## 6. One alert per double booking  (`0eaa4720`)

This is the fix for the nine identical emails.

| # | Do this | Pass looks like |
|---|---|---|
| 6.1 | With an unresolved conflict present, run the Airbnb sync **twice** | **One** alert email in total, not one per run |
| 6.2 | Mark the conflict resolved (`ical_conflicts.resolved_at`), sync again while it is still detectable | The alert comes **again** — resolving means "I dealt with it", so a recurrence is news |
| 6.3 | Change the channel block to different nights, sync | A **fresh** alert: different nights are a different problem |

> Known and unfixed: a stay recorded through the ordinary **New booking** form instead of **Add booking details** has no channel link, so the sync still reports it as a double booking — once, now, instead of endlessly.

---

## 7. Money-write serialisation  (`5963f6cd`)

Mostly invisible; the one thing to confirm is that nothing regressed.

| # | Do this | Pass looks like |
|---|---|---|
| 7.1 | Record a payment, void it, record a refund | All three behave exactly as before |
| 7.2 | Re-run test 2.7 | Still refused, figures still intact |

---

## 8. Housekeeping schedule  (`3a227b3b`)

**Shipped switched off.** Nothing to test unless you decide to turn it on.

| # | Do this | Pass looks like |
|---|---|---|
| 8.1 | Confirm it is off | `select jobname, schedule from cron.job where jobname='villa-sync';` exists, and `app.villa_app_url` is unset, so each tick does nothing |
| 8.2 | **Only when you want it live** (it sends due guest emails): set the two settings in the release notes, then watch one 15-minute tick | Guest IDs past retention are purged; mirror refreshes |

---

## 9. Reports: NET RECEIVED removed  *(not yet committed)*

| # | Do this | Pass looks like |
|---|---|---|
| 9.1 | Villa Reports → Revenue & Occupancy | **No "Net Received" tile.** Total Booking Value, Occupancy, Total Expenses, ADR and RevPAR remain |
| 9.2 | Monthly Performance table | No "Net Received" column; the row totals still line up |
| 9.3 | Download the CSV and the PDF | Neither has a Net Received column, and the other columns are unchanged |

> Why: it was Total Booking Value **minus** Total Expenses — both already on the page — under a name that implied cash received. It read ₹2,59,620 when actual receipts were ₹1,95,200.

---

## 10. Phase 3 — change a booking's dates  *(not yet committed)*

**Needs two migrations first:** `00112_move_booking_dates.sql` in
**villa-booking**, and `20261106140000_villa_dates_changed_activity.sql` in
Ooruda. Booking page → **Change dates**. Admin only.

| # | Do this | Pass looks like |
|---|---|---|
| 10.1 | Open it on a confirmed, unpaid-or-part-paid direct booking | Dates pre-filled; "Move booking" disabled until they change |
| 10.2 | Set check-out before check-in | "Check-out must be after check-in", Save disabled |
| 10.3 | Move to free nights **at a different seasonal rate**, save | "Dates changed. The stay has been re-priced." — and the total matches the **rate card for the new nights**, not the old price |
| 10.4 | Check the Payments card | Balance due reflects the new total; part-paid stays part-paid |
| 10.5 | Move onto nights another booking holds | Refused: "Some of those nights are already booked…", dates unchanged |
| 10.6 | Move onto an Airbnb-blocked span | Refused as blocked |
| 10.7 | Move past the **booking cutoff** in Villa Settings | Refused, naming the cutoff date |
| 10.8 | Try on an **Airbnb** booking, an **invoiced** one, and one already **checked in** | No "Change dates" button on any of them |
| 10.9 | Calendar | The old nights are free and the new ones occupied |
| 10.10 | Activity log | "Dates changed" with your reason and both spans |

> The move is **one statement** on the booking site, so the old nights are
> released and the new ones claimed together. It can never half-happen and
> leave the guest with nothing.

---

## 11. Regression sweep

Quick pass over what these changes touch:

- Create a new booking, confirm it, record a payment, check in, check out
- Cancel a booking and confirm the refund figure
- Run an Airbnb sync and confirm the calendar matches the feed
- Open Villa Reports on each of the four tabs

---

## Not in this release, deliberately

| | Why |
|---|---|
| Invoice on demand | Held pending the invoice format. Nothing was built, nothing to revert. **Consequence:** paid direct bookings are auto-invoiced, so Adjust amount and Change dates refuse them |
| Itemised add-ons | Needs a new table in both databases |
| GST on a retained cancellation charge | Waiting on the CA |
| Villa i18n | After the module is translated |
| The last sliver of the adjustment race | Needs the booking total moved into Ooruda, or a two-phase protocol — an architecture decision |
