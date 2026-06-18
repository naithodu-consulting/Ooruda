-- =============================================================
-- PropTech RLS — tenant isolation and the write-policy matrix
-- -------------------------------------------------------------
-- Validates the row-level security from 20260612000000_proptech_domain.sql
-- (member_read) and 20260614000003_assoc_setup.sql (write policies):
--   * a member reads only their own association's rows, never another
--     tenant's (multi-tenant isolation)
--   * associations: only assoc_admin may UPDATE
--   * billing_settings / charge_types: assoc_admin + billing_operator may
--     write; prop_owner / tenant may not
--   * charge_types: only assoc_admin may INSERT custom types
--   * units / bills / payments have NO write policy yet (features still
--     stubbed) — so even assoc_admin is denied writes; this test pins that
--     current state so a future write-enabling migration updates it knowingly
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

-- ── Setup: assoc-a with all four roles; assoc-b + an outsider ──
select tests.create_supabase_user('admin_a');
select tests.create_supabase_user('operator_a');
select tests.create_supabase_user('owner_a');
select tests.create_supabase_user('tenant_a');
select tests.create_supabase_user('admin_b');
select tests.create_supabase_user('outsider');

set local role service_role;
select public.create_team_account('Assoc A', tests.get_supabase_uid('admin_a'), 'assoc-a');
select public.create_team_account('Assoc B', tests.get_supabase_uid('admin_b'), 'assoc-b');

set local role postgres;
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (makerkit.get_account_id_by_slug('assoc-a'), tests.get_supabase_uid('operator_a'), 'billing_operator'),
  (makerkit.get_account_id_by_slug('assoc-a'), tests.get_supabase_uid('owner_a'),    'prop_owner'),
  (makerkit.get_account_id_by_slug('assoc-a'), tests.get_supabase_uid('tenant_a'),   'tenant');

-- ═════════════════════════════════════════════════════════════
-- READ ISOLATION
-- ═════════════════════════════════════════════════════════════
select makerkit.authenticate_as('tenant_a');

-- A plain tenant can read their own association + its charge types.
select isnt_empty(
  $$ select 1 from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  'a tenant can read their own association'
);
select results_eq(
  $$ select count(*)::int from public.charge_types
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a')) $$,
  $$ values (3) $$,
  'a member sees their association''s three builtin charge types'
);

-- ...but cannot see another association's rows.
select is_empty(
  $$ select 1 from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-b') $$,
  'a member of assoc-a cannot read assoc-b'
);
select is_empty(
  $$ select 1 from public.charge_types
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-b')) $$,
  'a member of assoc-a cannot read assoc-b''s charge types'
);

-- An outsider with no membership sees nothing at all.
select makerkit.authenticate_as('outsider');
select is_empty(
  $$ select 1 from public.associations $$,
  'a non-member sees no associations'
);
select is_empty(
  $$ select 1 from public.charge_types $$,
  'a non-member sees no charge types'
);

-- ═════════════════════════════════════════════════════════════
-- WRITE POLICY: associations (assoc_admin only)
-- ═════════════════════════════════════════════════════════════
-- UPDATE under RLS: rows failing the USING clause are invisible to the
-- statement, so an unauthorized UPDATE ... RETURNING yields zero rows.
select makerkit.authenticate_as('admin_a');
select isnt_empty(
  $$ update public.associations set address = 'New HQ'
     where account_id = makerkit.get_account_id_by_slug('assoc-a')
     returning id $$,
  'assoc_admin can update their association'
);

select makerkit.authenticate_as('operator_a');
select is_empty(
  $$ update public.associations set address = 'Hijack'
     where account_id = makerkit.get_account_id_by_slug('assoc-a')
     returning id $$,
  'billing_operator cannot update the association record'
);

select makerkit.authenticate_as('tenant_a');
select is_empty(
  $$ update public.associations set address = 'Hijack'
     where account_id = makerkit.get_account_id_by_slug('assoc-a')
     returning id $$,
  'tenant cannot update the association record'
);

-- ═════════════════════════════════════════════════════════════
-- WRITE POLICY: billing_settings (assoc_admin + billing_operator)
-- ═════════════════════════════════════════════════════════════
select makerkit.authenticate_as('operator_a');
select isnt_empty(
  $$ update public.billing_settings set minimum_electricity_charge = 100
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a'))
     returning id $$,
  'billing_operator can update billing settings'
);

select makerkit.authenticate_as('owner_a');
select is_empty(
  $$ update public.billing_settings set minimum_electricity_charge = 999
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a'))
     returning id $$,
  'prop_owner cannot update billing settings'
);

-- ═════════════════════════════════════════════════════════════
-- WRITE POLICY: charge_types (update: admin+operator; insert: admin only)
-- ═════════════════════════════════════════════════════════════
select makerkit.authenticate_as('operator_a');
select isnt_empty(
  $$ update public.charge_types set is_active = false
     where key = 'penalty'
       and association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a'))
     returning id $$,
  'billing_operator can toggle a charge type (operator_update policy)'
);

-- INSERT under RLS: a row failing WITH CHECK raises 42501.
select throws_ok(
  $$ insert into public.charge_types (association_id, key, name, calc_method, frequency)
     select id, 'water', 'Water', 'per_unit', 'Monthly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '42501'::text,
  null::text,
  'billing_operator cannot INSERT a custom charge type (admin_insert only)'
);

select makerkit.authenticate_as('admin_a');
select lives_ok(
  $$ insert into public.charge_types (association_id, key, name, calc_method, frequency)
     select id, 'water', 'Water', 'per_unit', 'Monthly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  'assoc_admin can INSERT a custom charge type'
);

-- assoc_admin cannot write into another tenant's association (WITH CHECK).
select throws_ok(
  $$ insert into public.charge_types (association_id, key, name, calc_method, frequency)
     select id, 'water', 'Water', 'per_unit', 'Monthly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-b') $$,
  '42501'::text,
  null::text,
  'an admin cannot create charge types in an association they do not belong to'
);

-- ═════════════════════════════════════════════════════════════
-- NO WRITE POLICY YET: units / bills / payments are read-only for
-- everyone (features stubbed). Even assoc_admin is denied INSERT.
-- ═════════════════════════════════════════════════════════════
select makerkit.authenticate_as('admin_a');
select throws_ok(
  $$ insert into public.units (association_id, unit_no, area_sqft)
     select id, 'U-1', 500
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '42501'::text,
  null::text,
  'units has no write policy yet — even assoc_admin INSERT is denied'
);

select * from finish();

ROLLBACK;
