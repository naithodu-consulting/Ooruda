-- =============================================================
-- Ooruda Villa M0 — product type, villa roles, invariants
-- -------------------------------------------------------------
-- Validates 20260927110925_villa_m0_foundations.sql:
--   * existing accounts/roles default to the association product
--   * villa roles exist at levels 10/11 with the villa product
--   * create_villa_account() makes a villa account, a villa_admin
--     membership, and NO associations row
--   * create_team_account() still auto-creates an associations row
--   * a membership/invitation role must match the account's product
--   * accounts.product_type is immutable
--   * villa_role() resolves only for villa members, only on villa accounts
--   * create_villa_account() is service-role only
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('villa_owner_user', 'villa-owner@test.com');
select tests.create_supabase_user('villa_other_user', 'villa-other@test.com');

set local role postgres;

-- ── Roles ────────────────────────────────────────────────────
select results_eq(
  $$ select name, hierarchy_level, product_type from public.roles
     where product_type = 'villa' order by hierarchy_level $$,
  $$ values ('villa_admin'::varchar, 10, 'villa'::text),
            ('villa_manager'::varchar, 11, 'villa'::text) $$,
  'villa roles exist at levels 10 and 11 with the villa product'
);

select is_empty(
  $$ select 1 from public.roles
     where name in ('assoc_admin','billing_operator','prop_owner','tenant')
       and product_type <> 'association' $$,
  'the four association roles keep the association product'
);

select isnt_empty(
  $$ select 1 from public.role_permissions
     where role = 'villa_admin' and permission = 'invites.manage' $$,
  'villa_admin can invite members'
);

select is_empty(
  $$ select 1 from public.role_permissions where role = 'villa_manager' $$,
  'villa_manager holds no Makerkit permissions'
);

-- ── Account creation ─────────────────────────────────────────
select tests.authenticate_as_service_role();

create temp table villa_acct on commit drop as
  select (public.create_villa_account(
    'Test Villa', tests.get_supabase_uid('villa_owner_user'))).id as id;

create temp table assoc_acct on commit drop as
  select (public.create_team_account(
    'Test Association M0', tests.get_supabase_uid('villa_owner_user'))).id as id;

set local role postgres;

-- The villa_role() checks below run as `authenticated` and read these ids.
grant select on villa_acct, assoc_acct to authenticated;

select is(
  (select product_type from public.accounts where id = (select id from villa_acct)),
  'villa',
  'create_villa_account sets product_type = villa'
);

select is(
  (select account_role::text from public.accounts_memberships
    where account_id = (select id from villa_acct)),
  'villa_admin',
  'the creator becomes villa_admin'
);

select is_empty(
  $$ select 1 from public.associations
     where account_id = (select id from villa_acct) $$,
  'a villa account gets no associations row'
);

select isnt_empty(
  $$ select 1 from public.associations
     where account_id = (select id from assoc_acct) $$,
  'an association account still gets its associations row'
);

select is(
  (select product_type from public.accounts where id = (select id from assoc_acct)),
  'association',
  'create_team_account defaults to the association product'
);

-- ── Role ↔ product invariant ─────────────────────────────────
select throws_ok(
  $$ insert into public.accounts_memberships (account_id, user_id, account_role)
     values ((select id from villa_acct),
             tests.get_supabase_uid('villa_other_user'), 'tenant') $$,
  '23514',
  null,
  'an association role cannot be granted on a villa account'
);

select throws_ok(
  $$ insert into public.accounts_memberships (account_id, user_id, account_role)
     values ((select id from assoc_acct),
             tests.get_supabase_uid('villa_other_user'), 'villa_manager') $$,
  '23514',
  null,
  'a villa role cannot be granted on an association account'
);

select throws_ok(
  $$ insert into public.invitations (account_id, invited_by, role, invite_token, email)
     values ((select id from assoc_acct),
             tests.get_supabase_uid('villa_owner_user'),
             'villa_admin', 'tok-villa-m0', 'x@test.com') $$,
  '23514',
  null,
  'a villa role cannot be invited to an association account'
);

select lives_ok(
  $$ insert into public.accounts_memberships (account_id, user_id, account_role)
     values ((select id from villa_acct),
             tests.get_supabase_uid('villa_other_user'), 'villa_manager') $$,
  'a villa_manager can be added to a villa account'
);

select throws_ok(
  $$ update public.accounts_memberships set account_role = 'billing_operator'
     where account_id = (select id from villa_acct)
       and user_id = tests.get_supabase_uid('villa_other_user') $$,
  '23514',
  null,
  'a villa member cannot be moved onto an association role'
);

-- ── product_type is immutable ────────────────────────────────
select throws_ok(
  $$ update public.accounts set product_type = 'association'
     where id = (select id from villa_acct) $$,
  'P0001',
  'accounts.product_type cannot be changed after creation',
  'product_type cannot be changed after creation'
);

-- ── villa_role() ─────────────────────────────────────────────
select tests.authenticate_as('villa_owner_user');

select is(
  public.villa_role((select id from villa_acct)),
  'villa_admin',
  'villa_role resolves the caller''s villa role'
);

select is(
  public.villa_role((select id from assoc_acct)),
  null,
  'villa_role is null on an association account, even for a member'
);

select tests.authenticate_as('villa_other_user');

select is(
  public.villa_role((select id from villa_acct)),
  'villa_manager',
  'villa_role resolves villa_manager'
);

select is(
  public.villa_role((select id from assoc_acct)),
  null,
  'villa_role is null for a non-member'
);

-- ── Moving a row to another account is re-checked ────────────
set local role postgres;

select lives_ok(
  $$ insert into public.invitations (account_id, invited_by, role, invite_token, email)
     values ((select id from villa_acct),
             tests.get_supabase_uid('villa_owner_user'),
             'villa_manager', 'tok-villa-move', 'move@test.com') $$,
  'a villa_manager invitation on a villa account is accepted'
);

select throws_ok(
  $$ update public.invitations set account_id = (select id from assoc_acct)
     where invite_token = 'tok-villa-move' $$,
  '23514',
  null,
  'a villa invitation cannot be moved onto an association account'
);

-- ── Ownership transfer promotes to the product's top role ────
select tests.authenticate_as_service_role();

select lives_ok(
  $$ select public.transfer_team_account_ownership(
       (select id from villa_acct), tests.get_supabase_uid('villa_other_user')) $$,
  'ownership of a villa account can be transferred'
);

set local role postgres;

select is(
  (select account_role::text from public.accounts_memberships
    where account_id = (select id from villa_acct)
      and user_id = tests.get_supabase_uid('villa_other_user')),
  'villa_admin',
  'the new villa owner is promoted to villa_admin, not assoc_admin'
);

select is(
  public.get_upper_role_for_account((select id from assoc_acct)),
  'assoc_admin',
  'an association account''s top role is still assoc_admin'
);

-- ── create_villa_account is service-role only ────────────────
select tests.authenticate_as('villa_other_user');

select throws_ok(
  $$ select public.create_villa_account('Sneaky Villa',
       tests.get_supabase_uid('villa_other_user')) $$,
  '42501',
  null,
  'authenticated users cannot call create_villa_account'
);

select * from finish();

ROLLBACK;
