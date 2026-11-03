-- =============================================================
-- Ooruda Villa M8a — discount codes
-- -------------------------------------------------------------
-- Validates 20260930052559_villa_m8_discount_codes.sql
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m8_owner', 'm8-owner@test.com');
select tests.create_supabase_user('m8_manager', 'm8-manager@test.com');
select tests.create_supabase_user('m8_other', 'm8-other@test.com');
select tests.create_supabase_user('m8_super', 'm8-super@test.com');

select tests.authenticate_as_service_role();

create temp table m8 on commit drop as
  select
    (public.create_villa_account('M8 Villa', tests.get_supabase_uid('m8_owner'))).id as villa_id,
    (public.create_villa_account('M8 Other', tests.get_supabase_uid('m8_other'))).id as other_id;

create temp table m8p on commit drop as
  select public.connect_villa_property((select villa_id from m8), 'http://127.0.0.1:1',
    'pgtap-m8.invalid', 'c0000000-0000-0000-0000-00000000c8a1', 'M8', 'M8 Villa',
    'test-service-key-0123456789') as id;

create temp table m8c (name text, id uuid) on commit drop;

set local role postgres;
grant select, insert on m8, m8p, m8c to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m8), tests.get_supabase_uid('m8_manager'), 'villa_manager');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = tests.get_supabase_uid('m8_super');

-- ── Owner creates codes ──────────────────────────────────────
select tests.authenticate_as('m8_owner');

select lives_ok(
  $$ insert into m8c select 'ten', id from public.save_villa_discount(
       null, (select id from m8p), 'monsoon 10', 'percent', 10, 3000,
       '2026-06-01', '2026-09-30', 2::smallint, 0, 50, 1::smallint, '[]'::jsonb, null) $$,
  'the owner creates a 10% code'
);

select is(
  (select code || ':' || status from public.villa_discount_codes where id = (select id from m8c where name = 'ten')),
  'MONSOON10:active',
  'stored in capitals without spaces, and active at once (within 25%)'
);

select is(
  (select count(*)::int from public.villa_discount_audit where code_id = (select id from m8c where name = 'ten')),
  1,
  'its creation is in the audit trail'
);

select lives_ok(
  $$ insert into m8c select 'forty', id from public.save_villa_discount(
       null, (select id from m8p), 'BIG40', 'percent', 40, 10000,
       '2026-06-01', '2026-09-30', 1::smallint, 0, 5, 1::smallint, '[]'::jsonb, null) $$,
  'the owner may save a 40% code...'
);

select is(
  (select status from public.villa_discount_codes where id = (select id from m8c where name = 'forty')),
  'pending_approval',
  '...but it waits for Ooruda approval'
);

select throws_ok(
  $$ select public.set_villa_discount_active((select id from m8c where name = 'forty'), true) $$,
  '22023',
  null,
  'the owner cannot switch on an unapproved code over 25%'
);

select lives_ok(
  $$ insert into m8c select 'flat', id from public.save_villa_discount(
       null, (select id from m8p), 'FLAT2000', 'flat', 2000, null,
       '2026-06-01', '2026-09-30', 1::smallint, 5000, null, 1::smallint, '[]'::jsonb, null) $$,
  'a flat ₹2,000 code on a ₹5,000 minimum...'
);

select is(
  (select status from public.villa_discount_codes where id = (select id from m8c where name = 'flat')),
  'pending_approval',
  '...is 40% of the minimum, so it also needs approval'
);

select throws_ok(
  $$ select public.save_villa_discount(
       null, (select id from m8p), 'NOCAP20', 'percent', 20, null,
       '2026-06-01', '2026-09-30', 1::smallint, 0, null, 1::smallint, '[]'::jsonb, null) $$,
  '23514',
  null,
  'a percentage code needs a rupee cap'
);

select throws_ok(
  $$ select public.save_villa_discount(
       null, (select id from m8p), 'monsoon10', 'percent', 5, 100,
       '2026-06-01', '2026-09-30', 1::smallint, 0, null, 1::smallint, '[]'::jsonb, null) $$,
  '23505',
  null,
  'codes are unique per villa, whatever the case'
);

select throws_ok(
  $$ select public.save_villa_discount(
       null, (select id from m8p), 'BLACK', 'percent', 5, 100,
       '2026-06-01', '2026-09-30', 1::smallint, 0, null, 1::smallint,
       '[{"start":"2026-12-31","end":"2026-12-30"}]'::jsonb, null) $$,
  '22023',
  null,
  'a blackout must end after it starts'
);

select throws_ok(
  $$ update public.villa_discount_codes set status = 'active' $$,
  '42501',
  null,
  'no direct writes: the ceiling cannot be bypassed'
);

-- ── Managers read only ───────────────────────────────────────
select tests.authenticate_as('m8_manager');

select is(
  (select count(*)::int from public.villa_discount_codes),
  3,
  'managers see the codes'
);

select throws_ok(
  $$ select public.save_villa_discount(
       null, (select id from m8p), 'MGR5', 'percent', 5, 100,
       '2026-06-01', '2026-09-30', 1::smallint, 0, null, 1::smallint, '[]'::jsonb, null) $$,
  '42501',
  null,
  'managers cannot create codes'
);

select throws_ok(
  $$ select public.review_villa_discount((select id from m8c where name = 'forty'), true) $$,
  '42501',
  null,
  'managers cannot approve'
);

-- ── Owner cannot approve their own ───────────────────────────
select tests.authenticate_as('m8_owner');

select throws_ok(
  $$ select public.review_villa_discount((select id from m8c where name = 'forty'), true) $$,
  '42501',
  null,
  'the owner cannot approve their own code over 25%'
);

-- ── Ooruda approves ──────────────────────────────────────────
select tests.authenticate_as('m8_super');
select set_config(
  'request.jwt.claims',
  (current_setting('request.jwt.claims')::jsonb || '{"aal": "aal2", "app_metadata": {"role": "super-admin"}}'::jsonb)::text,
  true
);

select is(
  (select status from public.review_villa_discount((select id from m8c where name = 'forty'), true)),
  'active',
  'a super-admin approves the 40% code'
);

select is(
  (select status from public.review_villa_discount((select id from m8c where name = 'flat'), false)),
  'rejected',
  'and can refuse another'
);

-- ── Editing an approved code over 25% needs approval again ───
select tests.authenticate_as('m8_owner');

select is(
  (select status from public.save_villa_discount(
     (select id from m8c where name = 'forty'), (select id from m8p), 'BIG40', 'percent', 45, 10000,
     '2026-06-01', '2026-09-30', 1::smallint, 0, 5, 1::smallint, '[]'::jsonb, null)),
  'pending_approval',
  'changing the terms of an approved code voids the approval'
);

select is(
  (select status from public.save_villa_discount(
     (select id from m8c where name = 'forty'), (select id from m8p), 'BIG40', 'percent', 20, 10000,
     '2026-06-01', '2026-09-30', 1::smallint, 0, 5, 1::smallint, '[]'::jsonb, null)),
  'active',
  'brought within 25%, it is active again'
);

select is(
  (select status from public.set_villa_discount_active((select id from m8c where name = 'ten'), false)),
  'paused',
  'the owner pauses a code'
);

select is(
  -- one transaction here, so one timestamp: compare as a set
  (select array_agg(action order by action)::text from public.villa_discount_audit
    where code_id = (select id from m8c where name = 'forty')),
  '{approved,created,updated,updated}',
  'the trail shows every step'
);

-- ── Other villas ─────────────────────────────────────────────
select tests.authenticate_as('m8_other');

select is_empty($$ select 1 from public.villa_discount_codes $$, 'another villa sees no codes');
select is_empty($$ select 1 from public.villa_discount_audit $$, 'nor their history');

select throws_ok(
  $$ select public.set_villa_discount_active((select id from m8c where name = 'ten'), true) $$,
  '42501',
  null,
  'nor can it switch them'
);

-- ── Ceiling cannot be dodged with NaN or odd input ───────────
select tests.authenticate_as('m8_owner');

select throws_ok(
  $$ select public.save_villa_discount(
       null, (select id from m8p), 'NANFLAT', 'flat', 1000000, null,
       '2026-06-01', '2026-09-30', 1::smallint, 'NaN'::numeric, null, 1::smallint, '[]'::jsonb, null) $$,
  '23514',
  null,
  'a NaN minimum value is refused (it would dodge the 25% ceiling)'
);

select throws_ok(
  $$ select public.save_villa_discount(
       null, (select id from m8p), 'NANPCT', 'percent', 10, 'NaN'::numeric,
       '2026-06-01', '2026-09-30', 1::smallint, 0, null, 1::smallint, '[]'::jsonb, null) $$,
  '23514',
  null,
  'a NaN cap is refused'
);

select is(
  (select status from public.save_villa_discount(
     null, (select id from m8p), 'FLATOK', 'flat', 1000, null,
     '2026-06-01', '2026-09-30', 1::smallint, 4000, null, 1::smallint,
     '[{"start":"2026-12-24","end":"2026-12-26","extra":"x"}]'::jsonb, null)),
  'active',
  'a flat ₹1,000 on a ₹4,000 minimum (exactly 25%) is fine'
);

select is(
  (select blackouts::text from public.villa_discount_codes where code = 'FLATOK'),
  '[{"end": "2026-12-26", "start": "2026-12-24"}]',
  'blackouts are stored as just their two dates'
);

-- ── Archiving: one way, and it closes every write path ───────
-- The actor's name is stamped onto the audit row at write time, not resolved
-- from profiles when the history is read: a member who leaves must not
-- rewrite their own past entries to "Unknown".
select tests.authenticate_as_service_role();
update public.profiles set full_name = 'M8 Admin'
 where id = tests.get_supabase_uid('m8_owner');
select tests.authenticate_as('m8_owner');

select is(
  (select status from public.archive_villa_discount(
     (select id from public.villa_discount_codes where code = 'FLATOK'))),
  'archived',
  'the villa admin can archive a code'
);

select is(
  (select count(*)::int from public.villa_discount_audit
    where code_id = (select id from public.villa_discount_codes where code = 'FLATOK')
      and action = 'archived'),
  1,
  'archiving is recorded in the audit trail'
);

select is(
  (select actor_name from public.villa_discount_audit
    where code_id = (select id from public.villa_discount_codes where code = 'FLATOK')
      and action = 'archived'),
  'M8 Admin',
  'the audit row carries the actor name, so history survives them leaving'
);

select throws_ok(
  $$ select public.archive_villa_discount(
       (select id from public.villa_discount_codes where code = 'FLATOK')) $$,
  '22023',
  null,
  'a code cannot be archived twice'
);

select throws_ok(
  $$ select public.set_villa_discount_active(
       (select id from public.villa_discount_codes where code = 'FLATOK'), true) $$,
  '22023',
  null,
  'an archived code cannot be resumed'
);

select throws_ok(
  $$ select public.save_villa_discount(
       (select id from public.villa_discount_codes where code = 'FLATOK'),
       (select id from m8p), 'FLATOK', 'flat', 1000, null,
       '2026-06-01', '2026-09-30', 1::smallint, 4000, null, 1::smallint, '[]'::jsonb, null) $$,
  '22023',
  null,
  'an archived code cannot be edited back into use'
);

select tests.authenticate_as('m8_manager');

select throws_ok(
  $$ select public.archive_villa_discount(
       (select id from public.villa_discount_codes where code = 'FLATOK')) $$,
  '42501',
  null,
  'a villa manager cannot archive a code'
);

select tests.authenticate_as('m8_other');

select throws_ok(
  $$ select public.archive_villa_discount(
       (select id from public.villa_discount_codes where code = 'FLATOK')) $$,
  '42501',
  null,
  'another villa''s admin cannot archive this villa''s code'
);

select * from finish();

ROLLBACK;
