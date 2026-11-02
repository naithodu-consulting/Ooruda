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

### Refund ladder on a part-paid booking — raised 2026-10-31
**Priority:** next, and it is a money-in-writing issue.
`CANCELLATION_TIERS` defines `fraction` as a fraction of the total **paid**
(`lib/villa/cancellation.ts`), but `renderGuestEmail` now feeds
`cancellationOutlook` the contract total (`total > 0 ? total : paid`). On a
part-paid booking the e-mail therefore prints rupee figures larger than the
guest could ever get back: a ₹54,280 stay with a ₹10,000 advance is promised
"₹54,280 will be refunded", under the company's CIN and GSTIN.
- The 2026-10-31 payment gate fixes only the ₹0 case: no payment, no
  confirmation e-mail (`lib/villa/booking-payments.ts`). Everything part-paid
  still over-promises.
- Fix is small — compute the ladder on the amount actually received (sum of
  non-voided `villa_booking_payments`) — but decide the wording first: the
  guest sees a smaller number than the policy percentages imply, so the e-mail
  probably needs a line saying the percentages apply to amounts already paid.
- Keep in step with `villa-booking`: its own confirmation quotes the same
  ladder from its own copy of the tiers, and a website booking is paid in full,
  which is why the site never hit this.
- Add a test alongside `guest-emails.test.ts` covering unpaid / part-paid /
  paid once the basis changes.

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

- **`invalidateFeedNamesCache` is never called** (`lib/villa-db/blocks.ts`), so
  renaming or adding an iCal feed leaves blocks labelled with the old channel
  name for up to five minutes. Wire it into the feed create/rename/delete paths,
  or drop it and say in the comment that the TTL is the policy.
- **A failed `ical_feeds` read caches an empty map for five minutes** (same
  file), so one transient error labels every channel block "Channel" and makes
  `channelValueForFeed` record the generic `channel` instead of `airbnb` —
  splitting one channel across two values in Reports. Don't cache a failed read.
- **The channel name is stored twice.** `channelBlockNote` writes the feed's
  name into the block note, but every reader takes the name from `ical_feeds`.
  The copy can drift after a rename. Worse, `parseChannelNote` picks the
  confirmation code as the first segment matching `^[A-Z0-9]{6,20}$`, so a feed
  named in capitals (`AIRBNB`) would be read back as a confirmation code and
  land in a payment reference. Drop the name from the note, or label the code.
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
- **`listBlocks`' 30-second cache breaks an existing test.**
  `villa-db.integration.test.ts` → "refuses to release a block a channel feed
  owns" re-reads the same window after deleting the feed and gets the cached
  list. Pre-existing, unrelated to this work: invalidate on delete, or have the
  test read a different range.
