-- =============================================================
-- Query Performance Fixes — 2026-07-31
-- =============================================================
-- Addresses three confirmed bottlenecks from pg_stat_statements:
--
-- 1. is_aal2() and is_super_admin() declared VOLATILE (plpgsql
--    default), causing PostgreSQL to re-evaluate them on every
--    row during RLS checks. Both functions only read auth.jwt(),
--    which is stable for the lifetime of a transaction.
--    Fix: add STABLE + SECURITY DEFINER.
--
-- 2. bill_line_items.bill_id has no index despite a FK
--    constraint. Every bills-with-line-items query does a
--    sequential scan on bill_line_items filtered by bill_id.
--    Fix: CREATE INDEX (table is small; brief lock is safe).
--
-- 3. team_account_workspace() is VOLATILE (plpgsql default).
--    It is a pure read function; marking it STABLE allows
--    PostgreSQL to fold repeated calls within a query plan.
--    Fix: add STABLE.
-- =============================================================


-- ── Fix 1a: is_aal2 — mark STABLE ───────────────────────────
-- Only reads auth.jwt() which is constant within a transaction.
create or replace function public.is_aal2()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_aal2 boolean;
begin
  select auth.jwt() ->> 'aal' = 'aal2' into v_is_aal2;
  return coalesce(v_is_aal2, false);
end
$$;

grant execute on function public.is_aal2() to authenticated;


-- ── Fix 1b: is_super_admin — mark STABLE ────────────────────
-- Only reads auth.jwt() (via is_aal2 above) — same guarantee.
create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_super_admin boolean;
begin
  if not public.is_aal2() then
    return false;
  end if;

  select (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'super-admin'
    into v_is_super_admin;

  return coalesce(v_is_super_admin, false);
end
$$;

grant execute on function public.is_super_admin() to authenticated;


-- ── Fix 2: bill_line_items — index on bill_id ───────────────
-- FK exists but PostgreSQL does not auto-index FK columns.
-- Every lateral join from bills → bill_line_items was doing a
-- sequential scan. bill_line_items is small (monthly cadence),
-- so a regular index is safe here.
create index if not exists idx_bill_line_items_bill_id
  on public.bill_line_items (bill_id);


-- ── Fix 3: team_account_workspace — mark STABLE ─────────────
-- Pure read: joins accounts, accounts_memberships, subscriptions,
-- roles, role_permissions. No writes. Marking STABLE lets the
-- planner avoid redundant re-execution within a query.
create or replace function public.team_account_workspace(account_slug text)
returns table (
  id uuid,
  name varchar(255),
  picture_url varchar(1000),
  slug text,
  role varchar(50),
  role_hierarchy_level int,
  primary_owner_user_id uuid,
  subscription_status public.subscription_status,
  permissions public.app_permissions[]
)
language plpgsql
stable
set search_path to ''
as $$
begin
  return query
  select
    accounts.id,
    accounts.name,
    accounts.picture_url,
    accounts.slug,
    accounts_memberships.account_role,
    roles.hierarchy_level,
    accounts.primary_owner_user_id,
    subscriptions.status,
    array_agg(role_permissions.permission)
  from
    public.accounts
    join public.accounts_memberships on accounts.id = accounts_memberships.account_id
    left join public.subscriptions on accounts.id = subscriptions.account_id
    join public.roles on accounts_memberships.account_role = roles.name
    left join public.role_permissions on accounts_memberships.account_role = role_permissions.role
  where
    accounts.slug = account_slug
    and accounts_memberships.user_id = (select auth.uid())
  group by
    accounts.id,
    accounts_memberships.account_role,
    subscriptions.status,
    roles.hierarchy_level;
end;
$$;

grant execute on function public.team_account_workspace(text)
  to authenticated, service_role;
