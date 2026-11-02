-- =============================================================
-- Ooruda Villa — Guest salutation, first name, and last name
--
-- Adds salutation and split name fields to:
--   1. villa_bookings_mirror: mirrors site bookings with guest_salutation,
--      guest_first_name, and guest_last_name
--   2. villa_guests: stores salutation, first_name, and last_name for guests
--      in the register (add ID dialog)
-- =============================================================

-- ── 1. villa_bookings_mirror ─────────────────────────────────
alter table public.villa_bookings_mirror
  add column if not exists guest_salutation text check (guest_salutation is null or guest_salutation in ('Mr', 'Mrs', 'Ms')),
  add column if not exists guest_first_name text check (guest_first_name is null or length(guest_first_name) <= 120),
  add column if not exists guest_last_name  text check (guest_last_name is null or length(guest_last_name) <= 120);

-- Backfill mirror rows
update public.villa_bookings_mirror
   set guest_first_name = split_part(btrim(guest_name), ' ', 1),
       guest_last_name = nullif(btrim(substring(btrim(guest_name) from position(' ' in btrim(guest_name)) + 1)), '')
 where guest_first_name is null
   and guest_name is not null
   and position(' ' in btrim(guest_name)) > 0;

update public.villa_bookings_mirror
   set guest_first_name = btrim(guest_name)
 where guest_first_name is null
   and guest_name is not null;

-- ── 2. villa_guests ──────────────────────────────────────────
alter table public.villa_guests
  add column if not exists salutation text check (salutation is null or salutation in ('Mr', 'Mrs', 'Ms')),
  add column if not exists first_name text check (first_name is null or length(btrim(first_name)) <= 120),
  add column if not exists last_name  text check (last_name is null or length(btrim(last_name)) <= 120);

-- Backfill villa_guests rows
update public.villa_guests
   set first_name = split_part(btrim(full_name), ' ', 1),
       last_name = nullif(btrim(substring(btrim(full_name) from position(' ' in btrim(full_name)) + 1)), '')
 where first_name is null
   and full_name is not null
   and position(' ' in btrim(full_name)) > 0;

update public.villa_guests
   set first_name = btrim(full_name)
 where first_name is null
   and full_name is not null;
