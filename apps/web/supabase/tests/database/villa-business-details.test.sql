-- =============================================================
-- Ooruda Villa — business details (legal name, GSTIN)
-- Validates 20260930072244_villa_business_details.sql
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('bd_owner', 'bd-owner@test.com');
select tests.create_supabase_user('bd_manager', 'bd-manager@test.com');

select tests.authenticate_as_service_role();

create temp table bd on commit drop as
  select (public.create_villa_account('BD Villa', tests.get_supabase_uid('bd_owner'))).id as villa_id;

create temp table bdp on commit drop as
  select public.connect_villa_property((select villa_id from bd), 'http://127.0.0.1:1',
    'pgtap-bd.invalid', 'c0000000-0000-0000-0000-00000000cbd1', 'BD', 'BD Villa',
    'test-service-key-0123456789') as id;

set local role postgres;
grant select on bd, bdp to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from bd), tests.get_supabase_uid('bd_manager'), 'villa_manager');

select tests.authenticate_as('bd_owner');

select lives_ok(
  $$ update public.villa_properties
       set legal_name = 'Habbaa Stays LLP', gstin = '29ABCDE1234F1Z5'
     where id = (select id from bdp) $$,
  'the owner sets the business name and GSTIN'
);

select throws_ok(
  $$ update public.villa_properties set gstin = '29ABCDE1234F1X5' where id = (select id from bdp) $$,
  '23514',
  null,
  'a GSTIN not in the official format is refused'
);

select tests.authenticate_as('bd_manager');

select is_empty(
  $$ update public.villa_properties set gstin = null where id = (select id from bdp) returning 1 $$,
  'a manager cannot change the business details'
);

select is(
  (select gstin from public.villa_properties where id = (select id from bdp)),
  '29ABCDE1234F1Z5',
  'the GSTIN is unchanged'
);

select * from finish();

ROLLBACK;
