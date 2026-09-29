-- =============================================================
-- Ooruda Villa M3b — bookings read-model (OORUDA_VILLA_PLAN.md §3.3)
--
-- villa_bookings_mirror   a COPY of the booking site's bookings, for
--                         dashboards and reports (SQL aggregation, joins to
--                         Ooruda-side payments/invoices later). Never a
--                         source of truth: operational screens read the site
--                         live, and the mirror can be rebuilt from scratch.
-- villa_mirror_sync_state one row per property: when the mirror was last
--                         refreshed, and the last error.
--
-- Both are written ONLY by the server (service role). Members read them.
-- Amounts are rupees (the site stores paise; the server converts).
-- =============================================================

-- ── 1. The mirror ─────────────────────────────────────────────
create table if not exists public.villa_bookings_mirror (
  property_id        uuid not null references public.villa_properties (id) on delete cascade,
  -- bookings.id on the villa-booking database
  site_booking_id    uuid not null,
  account_id         uuid not null references public.accounts (id) on delete cascade,
  -- properties.id on the site; rows from a previously linked site are purged
  -- by the sync, so a re-linked villa never mixes two sites' bookings.
  site_property_id   uuid not null,
  booking_code       text check (booking_code is null or length(booking_code) <= 32),
  reference_number   text not null check (length(reference_number) <= 64),
  -- 'event' is set by Ooruda when it records an event booking; the sync never
  -- overwrites it.
  booking_kind       text not null default 'stay' check (booking_kind in ('stay', 'event')),
  channel            text check (channel is null or length(channel) <= 32),
  status             text not null check (length(status) <= 32),
  payment_status     text not null check (length(payment_status) <= 32),
  check_in           date not null,
  check_out          date not null,
  nights             integer not null check (nights >= 0),
  adults             integer not null check (adults >= 0),
  children           integer not null check (children >= 0),
  infants            integer not null check (infants >= 0),
  base_amount        numeric(12, 2) not null,
  extra_guest_amount numeric(12, 2) not null,
  tax_amount         numeric(12, 2) not null,
  total_amount       numeric(12, 2) not null,
  id_status          text check (id_status is null or length(id_status) <= 32),
  invoice_number     text check (invoice_number is null or length(invoice_number) <= 64),
  guest_name         text not null check (length(guest_name) <= 200),
  guest_phone        text check (guest_phone is null or length(guest_phone) <= 32),
  guest_email        text check (guest_email is null or length(guest_email) <= 320),
  site_updated_at    timestamptz,
  synced_at          timestamptz not null default now(),
  primary key (property_id, site_booking_id),
  constraint villa_bookings_mirror_dates check (check_out > check_in)
);

create index if not exists villa_bookings_mirror_account_idx
  on public.villa_bookings_mirror (account_id, check_in);
create index if not exists villa_bookings_mirror_stay_idx
  on public.villa_bookings_mirror (property_id, check_in, check_out);

create trigger villa_bookings_mirror_scope
  before insert or update of account_id, property_id on public.villa_bookings_mirror
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_bookings_mirror enable row level security;
revoke all on public.villa_bookings_mirror from anon, authenticated, service_role;
grant select on public.villa_bookings_mirror to authenticated;
grant select, insert, update, delete on public.villa_bookings_mirror to service_role;

create policy villa_bookings_mirror_read on public.villa_bookings_mirror
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 2. Sync state ─────────────────────────────────────────────
create table if not exists public.villa_mirror_sync_state (
  property_id      uuid primary key references public.villa_properties (id) on delete cascade,
  account_id       uuid not null references public.accounts (id) on delete cascade,
  last_synced_at   timestamptz,
  -- The first sync copies every booking; later ones re-read a date window.
  last_full_at     timestamptz,
  -- The site property the last full copy came from: a re-linked villa gets
  -- a fresh full copy.
  full_site_property_id uuid,
  -- Lease: a sync in progress. Others skip while it is recent.
  sync_started_at  timestamptz,
  last_error       text check (last_error is null or length(last_error) <= 1000),
  last_error_at    timestamptz,
  rows_synced      integer not null default 0 check (rows_synced >= 0)
);

create index if not exists villa_mirror_sync_state_account_idx
  on public.villa_mirror_sync_state (account_id);

create trigger villa_mirror_sync_state_scope
  before insert or update of account_id, property_id on public.villa_mirror_sync_state
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_mirror_sync_state enable row level security;
revoke all on public.villa_mirror_sync_state from anon, authenticated, service_role;
grant select on public.villa_mirror_sync_state to authenticated;
grant select, insert, update, delete on public.villa_mirror_sync_state to service_role;

create policy villa_mirror_sync_state_read on public.villa_mirror_sync_state
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());
