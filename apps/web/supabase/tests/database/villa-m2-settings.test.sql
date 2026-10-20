-- =============================================================
-- Ooruda Villa M2 — settings, add-ons, emergency contacts
-- -------------------------------------------------------------
-- Validates 20260929131714_villa_m2_settings_addons_contacts.sql:
--   * owners write, managers read, outsiders see nothing
--   * a row cannot name another account's property
--   * E.164 phones and price/unit checks
--   * owners can set the OTA buffer but not the ID retention period
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m2_owner', 'm2-owner@test.com');
select tests.create_supabase_user('m2_manager', 'm2-manager@test.com');
select tests.create_supabase_user('m2_other', 'm2-other@test.com');

select tests.authenticate_as_service_role();

create temp table m2 on commit drop as
  select
    (public.create_villa_account('M2 Villa', tests.get_supabase_uid('m2_owner'))).id as villa_id,
    (public.create_villa_account('M2 Other', tests.get_supabase_uid('m2_other'))).id as other_id;

create temp table m2p on commit drop as
  select
    public.connect_villa_property((select villa_id from m2), 'http://127.0.0.1:1',
      'pgtap-m2.invalid', 'a0000000-0000-0000-0000-00000000a001', 'M2', 'M2 Villa',
      'test-service-key-0123456789') as villa_prop,
    public.connect_villa_property((select other_id from m2), 'http://127.0.0.1:1',
      'pgtap-m2.invalid', 'a0000000-0000-0000-0000-00000000a002', 'OT', 'Other Villa',
      'test-service-key-0123456789') as other_prop;

set local role postgres;

grant select on m2, m2p to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m2), tests.get_supabase_uid('m2_manager'), 'villa_manager');

-- ── Owner writes ─────────────────────────────────────────────
select tests.authenticate_as('m2_owner');

select lives_ok(
  $$ insert into public.villa_account_settings (account_id, managers_can_cancel)
     values ((select villa_id from m2), true) $$,
  'the owner can save account settings'
);

select lives_ok(
  $$ insert into public.villa_addons (account_id, property_id, name, price, pricing_unit)
     values ((select villa_id from m2), (select villa_prop from m2p), 'Extra bed', 1000, 'per_night') $$,
  'the owner can add an add-on'
);

select lives_ok(
  $$ insert into public.villa_emergency_contacts (account_id, property_id, category, name, phone)
     values ((select villa_id from m2), (select villa_prop from m2p), 'caretaker', 'Ramesh', '+919876543210') $$,
  'the owner can add an emergency contact'
);

select throws_ok(
  $$ insert into public.villa_emergency_contacts (account_id, property_id, category, name, phone)
     values ((select villa_id from m2), (select villa_prop from m2p), 'police', 'Station', '9876543210') $$,
  '23514',
  null,
  'phones must be E.164'
);

select throws_ok(
  $$ insert into public.villa_addons (account_id, property_id, name, price, pricing_unit)
     values ((select villa_id from m2), (select villa_prop from m2p), 'Free money', -1, 'per_stay') $$,
  '23514',
  null,
  'add-on prices cannot be negative'
);

select lives_ok(
  $$ update public.villa_properties set ota_buffer_nights = 1
     where id = (select villa_prop from m2p) $$,
  'the owner can set the OTA buffer'
);

select throws_ok(
  $$ update public.villa_properties set retention_days = 3650
     where id = (select villa_prop from m2p) $$,
  '42501',
  null,
  'the owner cannot change the ID retention period'
);

select throws_ok(
  $$ insert into public.villa_addons (account_id, property_id, name, price, pricing_unit)
     values ((select villa_id from m2), (select villa_prop from m2p), 'EXTRA BED', 900, 'per_night') $$,
  '23505',
  null,
  'add-on names are unique regardless of case'
);

-- ── Cross-account property ───────────────────────────────────
select throws_ok(
  $$ insert into public.villa_addons (account_id, property_id, name, price, pricing_unit)
     values ((select villa_id from m2), (select other_prop from m2p), 'Sneaky', 1, 'per_stay') $$,
  '23514',
  'That villa property belongs to another account',
  'a row cannot name another account''s property'
);

-- ── Manager reads only ───────────────────────────────────────
select tests.authenticate_as('m2_manager');

select results_eq(
  $$ select count(*)::int from public.villa_addons $$,
  $$ values (1) $$,
  'the manager reads add-ons'
);

select results_eq(
  $$ select count(*)::int from public.villa_emergency_contacts $$,
  $$ values (1) $$,
  'the manager reads emergency contacts'
);

select throws_ok(
  $$ insert into public.villa_addons (account_id, property_id, name, price, pricing_unit)
     values ((select villa_id from m2), (select villa_prop from m2p), 'Manager add', 1, 'per_stay') $$,
  '42501',
  null,
  'the manager cannot add add-ons'
);

update public.villa_account_settings set managers_can_cancel = false
where account_id = (select villa_id from m2);

set local role postgres;

select is(
  (select managers_can_cancel from public.villa_account_settings
    where account_id = (select villa_id from m2)),
  true,
  'the manager cannot change account settings'
);

-- ── Outsider (owner of a different villa) ────────────────────
select tests.authenticate_as('m2_other');

select is_empty(
  $$ select 1 from public.villa_addons where account_id = (select villa_id from m2) $$,
  'another villa''s owner sees no add-ons'
);

select is_empty(
  $$ select 1 from public.villa_emergency_contacts where account_id = (select villa_id from m2) $$,
  'another villa''s owner sees no emergency contacts'
);

select is_empty(
  $$ select 1 from public.villa_account_settings where account_id = (select villa_id from m2) $$,
  'another villa''s owner sees no settings'
);

-- ── Super-admin acts as owner ────────────────────────────────
set local role postgres;

select tests.create_supabase_user('m2_super', 'm2-super@test.com');
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = tests.get_supabase_uid('m2_super');

select tests.authenticate_as('m2_super');
select set_config(
  'request.jwt.claims',
  (current_setting('request.jwt.claims')::jsonb || '{"aal": "aal2", "app_metadata": {"role": "super-admin"}}'::jsonb)::text,
  true
);

update public.villa_properties set ota_buffer_nights = 3
where id = (select villa_prop from m2p);

set local role postgres;

select is(
  (select ota_buffer_nights::int from public.villa_properties where id = (select villa_prop from m2p)),
  3,
  'a super-admin''s edit to a villa property is applied, not silently dropped'
);

select * from finish();

ROLLBACK;
