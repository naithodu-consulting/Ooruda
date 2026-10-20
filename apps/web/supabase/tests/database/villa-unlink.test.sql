-- =============================================================
-- Ooruda Villa — disconnect unlinks (keeps settings); connect re-links
-- -------------------------------------------------------------
-- Validates 20260929143252_villa_unlink_keeps_settings.sql
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('ul_owner', 'ul-owner@test.com');
select tests.create_supabase_user('ul_other', 'ul-other@test.com');

select tests.authenticate_as_service_role();

create temp table ul on commit drop as
  select
    (public.create_villa_account('UL Villa', tests.get_supabase_uid('ul_owner'))).id as villa_id,
    (public.create_villa_account('UL Other', tests.get_supabase_uid('ul_other'))).id as other_id;

create temp table ulp on commit drop as
  select public.connect_villa_property((select villa_id from ul), 'http://127.0.0.1:1',
    'pgtap-ul.invalid', 'b0000000-0000-0000-0000-00000000b001', 'UL', 'UL Villa',
    'test-service-key-0123456789') as id;

set local role postgres;

insert into public.villa_addons (account_id, property_id, name, price, pricing_unit)
values ((select villa_id from ul), (select id from ulp), 'Extra bed', 1000, 'per_night');
insert into public.villa_emergency_contacts (account_id, property_id, category, name, phone)
values ((select villa_id from ul), (select id from ulp), 'caretaker', 'Ramesh', '+919876543210');

create temp table ulref on commit drop as
  select site_credentials_ref as ref from public.villa_properties where id = (select id from ulp);

-- ── Disconnect keeps the property and its settings ───────────
select tests.authenticate_as_service_role();

select lives_ok(
  $$ select public.disconnect_villa_property((select villa_id from ul), (select id from ulp)) $$,
  'the service role can disconnect'
);

set local role postgres;

select results_eq(
  $$ select site_property_id is null, site_project_ref is null, site_credentials_ref is null
     from public.villa_properties where id = (select id from ulp) $$,
  $$ values (true, true, true) $$,
  'disconnect clears the link and the key reference'
);

select is_empty(
  $$ select 1 from vault.secrets where id = (select ref from ulref) $$,
  'disconnect deletes the stored key'
);

select results_eq(
  $$ select
       (select count(*)::int from public.villa_addons where property_id = (select id from ulp)),
       (select count(*)::int from public.villa_emergency_contacts where property_id = (select id from ulp)) $$,
  $$ values (1, 1) $$,
  'add-ons and contacts survive a disconnect'
);

-- ── Re-link the same property ────────────────────────────────
select tests.authenticate_as_service_role();

select is(
  public.connect_villa_property((select villa_id from ul), 'http://127.0.0.1:1',
    'pgtap-ul.invalid', 'b0000000-0000-0000-0000-00000000b002', 'UL', 'ignored',
    'test-service-key-0123456789', (select id from ulp)),
  (select id from ulp),
  're-connecting with p_property_id re-links the same property'
);

set local role postgres;

select results_eq(
  $$ select site_property_id::text, name from public.villa_properties where id = (select id from ulp) $$,
  $$ values ('b0000000-0000-0000-0000-00000000b002'::text, 'UL Villa'::text) $$,
  're-linking points at the new site property and keeps the name'
);

select is(
  (select count(*)::int from public.villa_properties where account_id = (select villa_id from ul)),
  1,
  're-linking does not create a duplicate property'
);

-- ── Guards ───────────────────────────────────────────────────
select tests.authenticate_as_service_role();

select throws_ok(
  $$ select public.connect_villa_property((select other_id from ul), 'http://127.0.0.1:1',
       'pgtap-ul.invalid', 'b0000000-0000-0000-0000-00000000b009', 'OT', 'x',
       'test-service-key-0123456789', (select id from ulp)) $$,
  'P0001',
  'Villa property not found for this account',
  'another account cannot re-link this villa''s property'
);

select throws_ok(
  $$ select public.disconnect_villa_property((select other_id from ul), (select id from ulp)) $$,
  'P0001',
  'Villa property not found for this account',
  'another account cannot disconnect this villa''s property'
);

set local role postgres;

select ok(
  not has_function_privilege('authenticated', 'public.disconnect_villa_property(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.disconnect_villa_property(uuid,uuid)', 'execute'),
  'only the service role can disconnect'
);

select * from finish();

ROLLBACK;
