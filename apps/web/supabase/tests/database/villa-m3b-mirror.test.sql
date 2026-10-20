-- =============================================================
-- Ooruda Villa M3b — bookings mirror + sync state
-- -------------------------------------------------------------
-- Validates 20260929190825_villa_m3b_bookings_mirror.sql
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m3b_owner', 'm3b-owner@test.com');
select tests.create_supabase_user('m3b_manager', 'm3b-manager@test.com');
select tests.create_supabase_user('m3b_other', 'm3b-other@test.com');

select tests.authenticate_as_service_role();

create temp table m3b on commit drop as
  select
    (public.create_villa_account('M3b Villa', tests.get_supabase_uid('m3b_owner'))).id as villa_id,
    (public.create_villa_account('M3b Other', tests.get_supabase_uid('m3b_other'))).id as other_id;

create temp table m3bp on commit drop as
  select public.connect_villa_property((select villa_id from m3b), 'http://127.0.0.1:1',
    'pgtap-m3b.invalid', 'c0000000-0000-0000-0000-00000000c3b1', 'M3B', 'M3b Villa',
    'test-service-key-0123456789') as id;

set local role postgres;

grant select on m3b, m3bp to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m3b), tests.get_supabase_uid('m3b_manager'), 'villa_manager');

-- ── Server writes ────────────────────────────────────────────
select tests.authenticate_as_service_role();

select lives_ok(
  $$ insert into public.villa_bookings_mirror
       (property_id, site_booking_id, account_id, site_property_id, reference_number,
        status, payment_status, check_in, check_out, nights, adults, children, infants,
        base_amount, extra_guest_amount, tax_amount, total_amount, guest_name)
     values ((select id from m3bp), 'd0000000-0000-0000-0000-00000000b001',
             (select villa_id from m3b), 'c0000000-0000-0000-0000-00000000c3b1', 'REF-1',
             'confirmed', 'unpaid', '2030-01-10', '2030-01-12', 2, 4, 0, 0,
             20000, 0, 3600, 23600, 'Asha') $$,
  'the server mirrors a booking'
);

select is(
  (select booking_kind from public.villa_bookings_mirror
    where site_booking_id = 'd0000000-0000-0000-0000-00000000b001'),
  'stay',
  'bookings are stays unless Ooruda marked an event'
);

select throws_ok(
  $$ insert into public.villa_bookings_mirror
       (property_id, site_booking_id, account_id, site_property_id, reference_number,
        status, payment_status, check_in, check_out, nights, adults, children, infants,
        base_amount, extra_guest_amount, tax_amount, total_amount, guest_name)
     values ((select id from m3bp), 'd0000000-0000-0000-0000-00000000b002',
             (select other_id from m3b), 'c0000000-0000-0000-0000-00000000c3b1', 'REF-2',
             'confirmed', 'unpaid', '2030-01-10', '2030-01-12', 2, 4, 0, 0,
             20000, 0, 3600, 23600, 'Ravi') $$,
  '23514',
  null,
  'a property cannot be mirrored under another account'
);

select throws_ok(
  $$ insert into public.villa_bookings_mirror
       (property_id, site_booking_id, account_id, site_property_id, reference_number,
        status, payment_status, check_in, check_out, nights, adults, children, infants,
        base_amount, extra_guest_amount, tax_amount, total_amount, guest_name)
     values ((select id from m3bp), 'd0000000-0000-0000-0000-00000000b003',
             (select villa_id from m3b), 'c0000000-0000-0000-0000-00000000c3b1', 'REF-3',
             'confirmed', 'unpaid', '2030-01-12', '2030-01-12', 0, 4, 0, 0,
             0, 0, 0, 0, 'Zero') $$,
  '23514',
  null,
  'a stay must end after it starts'
);

select lives_ok(
  $$ insert into public.villa_mirror_sync_state (property_id, account_id, last_synced_at)
     values ((select id from m3bp), (select villa_id from m3b), now()) $$,
  'the server records the sync time'
);

-- ── Members read only ────────────────────────────────────────
select tests.authenticate_as('m3b_manager');

select is(
  (select count(*)::int from public.villa_bookings_mirror),
  1,
  'members read their villa''s mirror'
);

select isnt_empty(
  $$ select 1 from public.villa_mirror_sync_state $$,
  'members read when the figures were updated'
);

select throws_ok(
  $$ insert into public.villa_bookings_mirror
       (property_id, site_booking_id, account_id, site_property_id, reference_number,
        status, payment_status, check_in, check_out, nights, adults, children, infants,
        base_amount, extra_guest_amount, tax_amount, total_amount, guest_name)
     values ((select id from m3bp), 'd0000000-0000-0000-0000-00000000b004',
             (select villa_id from m3b), 'c0000000-0000-0000-0000-00000000c3b1', 'REF-4',
             'confirmed', 'paid', '2030-02-10', '2030-02-12', 2, 4, 0, 0,
             1, 0, 0, 1, 'Forged') $$,
  '42501',
  null,
  'members cannot write the mirror (figures come only from the site)'
);

select throws_ok(
  $$ update public.villa_bookings_mirror set total_amount = 1 $$,
  '42501',
  null,
  'members cannot change mirrored amounts'
);

select throws_ok(
  $$ update public.villa_mirror_sync_state set last_synced_at = now() $$,
  '42501',
  null,
  'members cannot fake a fresh sync'
);

-- ── Other villa ──────────────────────────────────────────────
select tests.authenticate_as('m3b_other');

select is_empty(
  $$ select 1 from public.villa_bookings_mirror $$,
  'another villa cannot read this villa''s bookings or guests'
);

select is_empty(
  $$ select 1 from public.villa_mirror_sync_state $$,
  'another villa cannot read this villa''s sync state'
);

select * from finish();

ROLLBACK;
