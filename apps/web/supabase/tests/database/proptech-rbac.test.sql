-- =============================================================
-- PropTech RBAC — roles, permission mapping, JWT claim hook
-- -------------------------------------------------------------
-- Validates the role model migrated in 20260614000001/2:
--   * the four PropOps roles exist at the correct hierarchy levels
--   * MakerKit's generic owner/member roles were removed
--   * role → permission grants match the design matrix
--   * has_permission() resolves correctly per role on a real account
--   * the custom access-token hook injects {account_id: role} claims
--
-- This is the database-side mirror of the pure logic asserted in
-- apps/web/lib/rbac.test.ts (hierarchy ordering + hasMinimumRole).
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

set local role postgres;

-- ─────────────────────────────────────────────────────────────
-- The four PropOps roles exist at the documented hierarchy levels
-- ─────────────────────────────────────────────────────────────
select results_eq(
  $$ select name, hierarchy_level from public.roles
     where name in ('assoc_admin','billing_operator','prop_owner','tenant')
     order by hierarchy_level $$,
  $$ values ('assoc_admin'::varchar, 1),
            ('billing_operator'::varchar, 2),
            ('prop_owner'::varchar, 3),
            ('tenant'::varchar, 4) $$,
  'the four PropOps roles exist with assoc_admin most privileged (level 1)'
);

-- ─────────────────────────────────────────────────────────────
-- MakerKit's default owner/member roles were removed
-- ─────────────────────────────────────────────────────────────
select is_empty(
  $$ select 1 from public.roles where name in ('owner','member') $$,
  'the generic MakerKit owner/member roles were dropped after migration'
);

-- ─────────────────────────────────────────────────────────────
-- Role → permission matrix
-- ─────────────────────────────────────────────────────────────
-- assoc_admin: full management surface
select isnt_empty(
  $$ select 1 from public.role_permissions
     where role = 'assoc_admin' and permission = 'members.manage' $$,
  'assoc_admin can manage members'
);
select isnt_empty(
  $$ select 1 from public.role_permissions
     where role = 'assoc_admin' and permission = 'billing.manage' $$,
  'assoc_admin can manage billing'
);

-- billing_operator: billing/payments/reporting, but NOT member management
select isnt_empty(
  $$ select 1 from public.role_permissions
     where role = 'billing_operator' and permission = 'billing.manage' $$,
  'billing_operator can manage billing'
);
select is_empty(
  $$ select 1 from public.role_permissions
     where role = 'billing_operator' and permission = 'members.manage' $$,
  'billing_operator cannot manage members'
);

-- prop_owner: read-only reporting access
select isnt_empty(
  $$ select 1 from public.role_permissions
     where role = 'prop_owner' and permission = 'reports.view' $$,
  'prop_owner can view reports'
);
select is_empty(
  $$ select 1 from public.role_permissions
     where role = 'prop_owner' and permission = 'billing.manage' $$,
  'prop_owner cannot manage billing'
);

-- tenant: no explicit permissions (read-only via RLS only)
select is_empty(
  $$ select 1 from public.role_permissions where role = 'tenant' $$,
  'tenant carries no explicit permissions'
);

-- ─────────────────────────────────────────────────────────────
-- has_permission() against a real account membership
-- ─────────────────────────────────────────────────────────────
select tests.create_supabase_user('rbac_admin');
select tests.create_supabase_user('rbac_operator');
select tests.create_supabase_user('rbac_tenant');

set local role service_role;
select public.create_team_account('RBAC Co', tests.get_supabase_uid('rbac_admin'), 'rbac-co');

set local role postgres;
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (makerkit.get_account_id_by_slug('rbac-co'), tests.get_supabase_uid('rbac_operator'), 'billing_operator'),
  (makerkit.get_account_id_by_slug('rbac-co'), tests.get_supabase_uid('rbac_tenant'),   'tenant');

select makerkit.authenticate_as('rbac_admin');
select row_eq(
  $$ select public.has_permission(auth.uid(),
       makerkit.get_account_id_by_slug('rbac-co'), 'members.manage'::app_permissions) $$,
  row(true),
  'assoc_admin resolves members.manage = true via has_permission'
);

select makerkit.authenticate_as('rbac_operator');
select row_eq(
  $$ select public.has_permission(auth.uid(),
       makerkit.get_account_id_by_slug('rbac-co'), 'billing.manage'::app_permissions) $$,
  row(true),
  'billing_operator resolves billing.manage = true'
);
select row_eq(
  $$ select public.has_permission(auth.uid(),
       makerkit.get_account_id_by_slug('rbac-co'), 'members.manage'::app_permissions) $$,
  row(false),
  'billing_operator resolves members.manage = false'
);

select makerkit.authenticate_as('rbac_tenant');
select row_eq(
  $$ select public.has_permission(auth.uid(),
       makerkit.get_account_id_by_slug('rbac-co'), 'billing.manage'::app_permissions) $$,
  row(false),
  'tenant resolves billing.manage = false'
);

-- ─────────────────────────────────────────────────────────────
-- Custom access-token hook injects {account_id: role} into claims
-- ─────────────────────────────────────────────────────────────
set local role postgres;
select results_eq(
  format($$ select kit.propops_custom_access_token_hook(
              jsonb_build_object(
                'user_id', %L,
                'claims', jsonb_build_object('role','authenticated')
              )
            ) -> 'claims' -> 'propops_roles' ->> %L $$,
          tests.get_supabase_uid('rbac_operator')::text,
          makerkit.get_account_id_by_slug('rbac-co')::text),
  $$ values ('billing_operator'::text) $$,
  'the access-token hook maps the account id to the member''s PropOps role'
);

select * from finish();

ROLLBACK;
