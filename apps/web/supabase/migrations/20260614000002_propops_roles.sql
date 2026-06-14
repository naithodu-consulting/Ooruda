-- =============================================================
-- PropOps Roles — Day 4 RBAC
-- Replaces MakerKit's generic owner/member with PropOps domain
-- roles. Depends on 20260614000001 having committed the new
-- app_permissions enum values first.
-- =============================================================

-- ── 1. Insert PropOps roles at temporary hierarchy levels ─────
-- Temporary levels (10/20/30/40) avoid the unique constraint on
-- hierarchy_level while 'owner' (1) and 'member' (2) still exist.
insert into public.roles (name, hierarchy_level) values
  ('assoc_admin',      10),
  ('billing_operator', 20),
  ('prop_owner',       30),
  ('tenant',           40)
on conflict (name) do nothing;

-- ── 2. Migrate existing memberships ──────────────────────────
-- PropOps roles now exist in the table, FK constraint satisfied.
-- 'owner'  → assoc_admin   (association creator)
-- 'member' → prop_owner    (generic invited member)
update public.accounts_memberships set account_role = 'assoc_admin' where account_role = 'owner';
update public.accounts_memberships set account_role = 'prop_owner'  where account_role = 'member';

-- ── 3. Drop MakerKit default roles ───────────────────────────
-- Memberships no longer reference them; FK + level constraints clear.
delete from public.role_permissions where role in ('owner', 'member');
delete from public.roles             where name  in ('owner', 'member');

-- ── 4. Correct hierarchy levels ──────────────────────────────
update public.roles set hierarchy_level = 1 where name = 'assoc_admin';
update public.roles set hierarchy_level = 2 where name = 'billing_operator';
update public.roles set hierarchy_level = 3 where name = 'prop_owner';
update public.roles set hierarchy_level = 4 where name = 'tenant';

-- ── 5. PropOps role → permission mapping ─────────────────────
insert into public.role_permissions (role, permission) values
  -- assoc_admin: full access
  ('assoc_admin', 'roles.manage'),
  ('assoc_admin', 'billing.manage'),
  ('assoc_admin', 'settings.manage'),
  ('assoc_admin', 'members.manage'),
  ('assoc_admin', 'invites.manage'),
  ('assoc_admin', 'units.manage'),
  ('assoc_admin', 'payments.manage'),
  ('assoc_admin', 'reports.view'),
  -- billing_operator: billing + payments + reporting
  ('billing_operator', 'billing.manage'),
  ('billing_operator', 'settings.manage'),
  ('billing_operator', 'payments.manage'),
  ('billing_operator', 'reports.view'),
  -- prop_owner: view reports (unit/payment detail enforced via RLS)
  ('prop_owner', 'reports.view')
  -- tenant: no explicit permissions; read-only access via RLS only
on conflict do nothing;

-- ── 6. Custom Access Token Hook ───────────────────────────────
-- Injects {"<account_id>": "<role>"} into every JWT so server
-- components and middleware can check roles without a DB round-trip.
--
-- Wire-up (one-time, done in Supabase Dashboard after migration):
--   Authentication → Hooks → Custom Access Token Hook
--   → Type: Postgres function
--   → Schema: kit   → Function: propops_custom_access_token_hook

create or replace function kit.propops_custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims      jsonb;
  assoc_roles jsonb;
begin
  claims := event -> 'claims';

  -- Build {"<account_id>": "<role>"} for every association membership.
  -- Personal accounts are excluded; they carry no PropOps role.
  select jsonb_object_agg(am.account_id::text, am.account_role)
  into   assoc_roles
  from   public.accounts_memberships am
  join   public.accounts             a  on a.id = am.account_id
  where  am.user_id           = (event ->> 'user_id')::uuid
    and  a.is_personal_account = false;

  if assoc_roles is not null then
    claims := jsonb_set(claims, '{propops_roles}', assoc_roles);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Allow Supabase's auth system to invoke the hook.
grant usage   on schema kit to supabase_auth_admin;
grant execute on function kit.propops_custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- Revoke from regular roles — only the auth system may call this.
revoke execute on function kit.propops_custom_access_token_hook(jsonb)
  from authenticated, anon, public;
