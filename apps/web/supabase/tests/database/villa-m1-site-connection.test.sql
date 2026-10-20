-- =============================================================
-- Ooruda Villa M1 — villa_properties, Vault credentials, sync log
-- -------------------------------------------------------------
-- Validates 20260929091855_villa_m1_site_connection.sql:
--   * connect_villa_property links a site property and stores the key in
--     one step; re-connecting rotates the key but keeps the owner's name and
--     status; a site property can never be linked to a second account
--   * members read their villa's properties; outsiders see nothing
--   * owners can rename; they can NOT repoint the link or the key
--   * managers cannot update at all; anon has no rights
--   * deleting a property deletes its Vault secret
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m1_owner', 'm1-owner@test.com');
select tests.create_supabase_user('m1_manager', 'm1-manager@test.com');
select tests.create_supabase_user('m1_outsider', 'm1-outsider@test.com');

select tests.authenticate_as_service_role();

create temp table m1 on commit drop as
  select
    (public.create_villa_account('M1 Villa', tests.get_supabase_uid('m1_owner'))).id as villa_id,
    (public.create_villa_account('M1 Other Villa', tests.get_supabase_uid('m1_outsider'))).id as other_villa_id,
    (public.create_team_account('M1 Association', tests.get_supabase_uid('m1_owner'))).id as assoc_id;

create temp table m1p on commit drop as
  select public.connect_villa_property(
    (select villa_id from m1),
    'http://127.0.0.1:54331', 'pgtap.invalid',
    'a1b2c3d4-0000-0000-0000-000000000001', 'V19', 'Villa 19',
    'test-service-key-0123456789') as id;

set local role postgres;

grant select on m1, m1p to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m1), tests.get_supabase_uid('m1_manager'), 'villa_manager');

-- ── Connect ──────────────────────────────────────────────────
select results_eq(
  $$ select name, booking_code_prefix, site_property_id::text, status
     from public.villa_properties where id = (select id from m1p) $$,
  $$ values ('Villa 19'::text, 'V19'::text,
             'a1b2c3d4-0000-0000-0000-000000000001'::text, 'active'::text) $$,
  'connect creates the linked property'
);

select tests.authenticate_as_service_role();

select results_eq(
  $$ select url, service_key from public.get_villa_site_credentials((select id from m1p)) $$,
  $$ values ('http://127.0.0.1:54331'::text, 'test-service-key-0123456789'::text) $$,
  'credentials round-trip through Vault'
);

set local role postgres;

-- Owner edits survive a re-connect (key rotation).
update public.villa_properties
set name = 'Villa 19 (Urwa)', status = 'inactive'
where id = (select id from m1p);

select tests.authenticate_as_service_role();

select is(
  public.connect_villa_property(
    (select villa_id from m1),
    'https://example.supabase.co', 'pgtap.invalid',
    'a1b2c3d4-0000-0000-0000-000000000001', 'V19', 'Renamed By Admin',
    'rotated-service-key-0123456789'),
  (select id from m1p),
  're-connecting returns the same property'
);

select is(
  (select service_key from public.get_villa_site_credentials((select id from m1p))),
  'rotated-service-key-0123456789',
  're-connecting rotates the key'
);

set local role postgres;

select results_eq(
  $$ select name, status from public.villa_properties where id = (select id from m1p) $$,
  $$ values ('Villa 19 (Urwa)'::text, 'inactive'::text) $$,
  're-connecting keeps the owner''s name and status'
);

select is(
  (select count(*)::int from vault.secrets where name like 'villa_site_credentials:%'
     and name = 'villa_site_credentials:' || (select id from m1p)::text),
  1,
  'rotation reuses one Vault secret'
);

-- ── One site property, one account ───────────────────────────
select tests.authenticate_as_service_role();

select throws_ok(
  $$ select public.connect_villa_property(
       (select other_villa_id from m1),
       'http://127.0.0.1:54331', 'pgtap.invalid',
       'a1b2c3d4-0000-0000-0000-000000000001', 'V19', 'Hijack',
       'test-service-key-0123456789') $$,
  '23505',
  'That booking-site property is already connected to another villa account',
  'a site property cannot be linked to a second villa account'
);

select throws_ok(
  $$ select public.connect_villa_property(
       (select assoc_id from m1),
       'http://127.0.0.1:54331', 'pgtap.invalid',
       'b1b2c3d4-0000-0000-0000-000000000002', 'V20', 'Wrong',
       'test-service-key-0123456789') $$,
  '23514',
  'Villa data can only belong to a villa account',
  'an association account cannot get a villa property'
);

select throws_ok(
  $$ select public.connect_villa_property(
       (select villa_id from m1),
       'ftp://x', 'pgtap.invalid',
       'c1b2c3d4-0000-0000-0000-000000000003', 'V21', 'Bad',
       'test-service-key-0123456789') $$,
  'P0001',
  'The site URL must start with https://',
  'a non-http URL is rejected'
);

-- ── Privileges ───────────────────────────────────────────────
set local role postgres;

select ok(
  not has_function_privilege('anon', 'public.get_villa_site_credentials(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_villa_site_credentials(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.connect_villa_property(uuid,text,text,uuid,text,text,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.connect_villa_property(uuid,text,text,uuid,text,text,text,uuid)', 'execute'),
  'only the service role can connect or read credentials'
);

select ok(
  not has_table_privilege('anon', 'public.villa_properties', 'select')
  and not has_table_privilege('anon', 'public.villa_properties', 'truncate')
  and not has_table_privilege('anon', 'public.villa_sync_log', 'truncate'),
  'anon has no rights on villa tables'
);

-- ── Owner ────────────────────────────────────────────────────
select tests.authenticate_as('m1_owner');

select results_eq(
  $$ select name from public.villa_properties $$,
  $$ values ('Villa 19 (Urwa)'::text) $$,
  'the owner reads their villa property'
);

select lives_ok(
  $$ update public.villa_properties set name = 'Villa 19', status = 'active'
     where id = (select id from m1p) $$,
  'the owner can rename and reactivate the property'
);

select throws_ok(
  $$ update public.villa_properties
     set site_property_id = 'ffffffff-0000-0000-0000-000000000001'
     where id = (select id from m1p) $$,
  '42501',
  null,
  'the owner cannot repoint the property at another site property'
);

select throws_ok(
  $$ update public.villa_properties set site_credentials_ref = gen_random_uuid()
     where id = (select id from m1p) $$,
  '42501',
  null,
  'the owner cannot swap the credentials reference'
);

select throws_ok(
  $$ insert into public.villa_properties (account_id, name)
     values ((select villa_id from m1), 'Self-made') $$,
  '42501',
  null,
  'the owner cannot create properties directly'
);

select throws_ok(
  $$ select * from public.get_villa_site_credentials((select id from m1p)) $$,
  '42501',
  null,
  'the owner cannot read the credentials'
);

select throws_ok(
  $$ select 1 from vault.decrypted_secrets $$,
  '42501',
  null,
  'the owner cannot read Vault directly'
);

-- ── Manager ──────────────────────────────────────────────────
select tests.authenticate_as('m1_manager');

select results_eq(
  $$ select count(*)::int from public.villa_properties $$,
  $$ values (1) $$,
  'the manager reads the villa property'
);

update public.villa_properties set name = 'Manager rename'
where id = (select id from m1p);

set local role postgres;

select is(
  (select name from public.villa_properties where id = (select id from m1p)),
  'Villa 19',
  'a manager''s update changes nothing'
);

-- ── Outsider ─────────────────────────────────────────────────
select tests.authenticate_as('m1_outsider');

select is_empty(
  $$ select 1 from public.villa_properties where id = (select id from m1p) $$,
  'another villa''s owner cannot see this villa''s property'
);

select is_empty(
  $$ select 1 from public.villa_sync_log where account_id = (select villa_id from m1) $$,
  'another villa''s owner cannot see this villa''s sync log'
);

-- ── Delete removes the key ───────────────────────────────────
set local role postgres;

create temp table m1ref on commit drop as
  select site_credentials_ref as ref from public.villa_properties where id = (select id from m1p);

delete from public.villa_properties where id = (select id from m1p);

select is_empty(
  $$ select 1 from vault.secrets where id = (select ref from m1ref) $$,
  'deleting a property deletes its Vault secret'
);

select * from finish();

ROLLBACK;
