-- =============================================================
-- Ooruda Villa M3a — cancellation reasons + booking activity trail
-- -------------------------------------------------------------
-- Validates 20260929144458_villa_m3a_bookings.sql
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m3_owner', 'm3-owner@test.com');
select tests.create_supabase_user('m3_manager', 'm3-manager@test.com');
select tests.create_supabase_user('m3_other', 'm3-other@test.com');

select tests.authenticate_as_service_role();

create temp table m3 on commit drop as
  select
    (public.create_villa_account('M3 Villa', tests.get_supabase_uid('m3_owner'))).id as villa_id,
    (public.create_villa_account('M3 Other', tests.get_supabase_uid('m3_other'))).id as other_id;

create temp table m3p on commit drop as
  select public.connect_villa_property((select villa_id from m3), 'http://127.0.0.1:1',
    'pgtap-m3.invalid', 'c0000000-0000-0000-0000-00000000c001', 'M3', 'M3 Villa',
    'test-service-key-0123456789') as id;

set local role postgres;

grant select on m3, m3p to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m3), tests.get_supabase_uid('m3_manager'), 'villa_manager');

-- ── Reasons ──────────────────────────────────────────────────
select tests.authenticate_as('m3_manager');

select is(
  (select count(*)::int from public.villa_cancellation_reasons where is_active),
  19,
  'the 19 agreed cancellation reasons are readable'
);

select is(
  (select note_required from public.villa_cancellation_reasons where code = 'other'),
  true,
  '"Other" requires a note'
);

-- ── Activity: written only by the server ─────────────────────
select throws_ok(
  $$ insert into public.villa_booking_activity
       (account_id, property_id, site_booking_id, booking_code, action, reason_code, actor_user_id)
     values ((select villa_id from m3), (select id from m3p),
             'd0000000-0000-0000-0000-00000000d001', 'M3-ABC-DEF', 'cancelled',
             'guest_change_of_plans', tests.get_supabase_uid('m3_manager')) $$,
  '42501',
  null,
  'a member cannot write history directly (no forged "cancelled" entries)'
);

select tests.authenticate_as_service_role();

select lives_ok(
  $$ insert into public.villa_booking_activity
       (account_id, property_id, site_booking_id, booking_code, action, actor_user_id)
     values ((select villa_id from m3), (select id from m3p),
             'd0000000-0000-0000-0000-00000000d001', 'M3-ABC-DEF', 'created',
             tests.get_supabase_uid('m3_manager')) $$,
  'the server records a booking'
);

select throws_ok(
  $$ insert into public.villa_booking_activity
       (account_id, property_id, site_booking_id, action, actor_user_id)
     values ((select villa_id from m3), (select id from m3p),
             'd0000000-0000-0000-0000-00000000d001', 'cancelled',
             tests.get_supabase_uid('m3_manager')) $$,
  '23514',
  null,
  'a cancellation without a reason is refused'
);

select lives_ok(
  $$ insert into public.villa_booking_activity
       (account_id, property_id, site_booking_id, action, reason_code, note, actor_user_id)
     values ((select villa_id from m3), (select id from m3p),
             'd0000000-0000-0000-0000-00000000d001', 'cancelled', 'guest_change_of_plans',
             'Called to cancel', tests.get_supabase_uid('m3_manager')) $$,
  'a cancellation with a reason is recorded'
);

select tests.authenticate_as('m3_manager');

select is(
  (select count(*)::int from public.villa_booking_activity
    where site_booking_id = 'd0000000-0000-0000-0000-00000000d001'),
  2,
  'members read their villa''s booking history'
);

select throws_ok(
  $$ update public.villa_booking_activity set note = 'rewritten' $$,
  '42501',
  null,
  'the trail is append-only (no updates)'
);

select throws_ok(
  $$ delete from public.villa_booking_activity $$,
  '42501',
  null,
  'the trail is append-only (no deletes)'
);

-- ── Other villa ──────────────────────────────────────────────
select tests.authenticate_as('m3_other');

select is_empty(
  $$ select 1 from public.villa_booking_activity where account_id = (select villa_id from m3) $$,
  'another villa cannot read this villa''s booking history'
);

select throws_ok(
  $$ insert into public.villa_booking_activity
       (account_id, property_id, site_booking_id, action, actor_user_id)
     values ((select villa_id from m3), (select id from m3p),
             'd0000000-0000-0000-0000-00000000d001', 'note',
             tests.get_supabase_uid('m3_other')) $$,
  '42501',
  null,
  'another villa cannot write into this villa''s history'
);

select * from finish();

ROLLBACK;
