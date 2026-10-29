-- =============================================================
-- Ooruda Villa M7 — guest email log
-- -------------------------------------------------------------
-- Validates 20260930032217_villa_m7_guest_emails.sql
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m7_owner', 'm7-owner@test.com');
select tests.create_supabase_user('m7_other', 'm7-other@test.com');

select tests.authenticate_as_service_role();

create temp table m7 on commit drop as
  select
    (public.create_villa_account('M7 Villa', tests.get_supabase_uid('m7_owner'))).id as villa_id,
    (public.create_villa_account('M7 Other', tests.get_supabase_uid('m7_other'))).id as other_id;

create temp table m7p on commit drop as
  select public.connect_villa_property((select villa_id from m7), 'http://127.0.0.1:1',
    'pgtap-m7.invalid', 'c0000000-0000-0000-0000-00000000c7a1', 'M7', 'M7 Villa',
    'test-service-key-0123456789') as id;

set local role postgres;
grant select on m7, m7p to authenticated;

select tests.authenticate_as_service_role();

select lives_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f701', 'pre_arrival', 'sending') $$,
  'the scheduler claims an automatic email'
);

select throws_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f701', 'pre_arrival', 'sending') $$,
  '23505',
  null,
  'a second automatic claim for the same email is impossible (never sent twice)'
);

select lives_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status, check_in)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f703', 'pre_arrival', 'sent', '2026-10-10') $$,
  'arrival email for a stay on 10 Oct'
);

select lives_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status, check_in)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f703', 'pre_arrival', 'sent', '2026-10-20') $$,
  'the stay moved to 20 Oct: a fresh arrival email may go'
);

select throws_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status, check_in)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f703', 'pre_arrival', 'sending', '2026-10-20') $$,
  '23505',
  null,
  '...but never twice for the same date'
);

select lives_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status, manual)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f701', 'pre_arrival', 'sent', true),
            ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f701', 'pre_arrival', 'sent', true) $$,
  'manual "send again" rows are allowed alongside'
);

select lives_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f701', 'thank_you', 'skipped') $$,
  'each email has its own claim'
);

select throws_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status)
     values ((select other_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f702', 'thank_you', 'sent') $$,
  '23514',
  null,
  'a log row cannot be filed under another account'
);

select lives_ok(
  $$ insert into public.villa_booking_activity
       (account_id, property_id, site_booking_id, action)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f701', 'reopened') $$,
  'undoing a check-out is recorded'
);

select tests.authenticate_as('m7_owner');

select is(
  (select count(*)::int from public.villa_message_log),
  6,
  'members see their villa''s email log'
);

select throws_ok(
  $$ insert into public.villa_message_log
       (account_id, property_id, site_booking_id, template, status)
     values ((select villa_id from m7), (select id from m7p),
             'd0000000-0000-0000-0000-00000000f709', 'thank_you', 'sent') $$,
  '42501',
  null,
  'members cannot write the log (no faking "sent")'
);

select is(
  (select string_agg(column_default, ',' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'villa_account_settings'
      and column_name in ('pre_arrival_email', 'thank_you_email')),
  'false,false',
  'pre-arrival and thank-you emails are off by default'
);

select tests.authenticate_as('m7_other');

select is_empty(
  $$ select 1 from public.villa_message_log $$,
  'another villa sees no email log'
);

select * from finish();

ROLLBACK;
