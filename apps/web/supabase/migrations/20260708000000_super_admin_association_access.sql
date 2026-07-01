-- =============================================================
-- Super Admin Association Access — Week 3
-- -------------------------------------------------------------
-- The workspace deep-linking feature lets super admins navigate
-- into any association's workspace via /admin.  However, all
-- the domain-level RLS policies (on associations, units, bills,
-- payments, etc.) are gated on is_association_member() and
-- association_role(), which only check accounts_memberships.
--
-- A super admin who is NOT an actual member of a given
-- association therefore hits RLS blocks on every query, causing
-- 500 errors across every page in that workspace.
--
-- Fix: redefine both helper functions to short-circuit when the
-- caller is a super-admin (i.e. their JWT app_metadata.role is
-- 'super-admin'), returning the correct values without touching
-- the memberships table.
-- =============================================================

-- ── is_association_member ────────────────────────────────────
-- Returns true if the current user is a member of the given
-- association OR is a platform super-admin.
create or replace function public.is_association_member(p_association_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    -- Super-admin: bypass membership check
    public.is_super_admin()
    or
    -- Normal path: check accounts_memberships
    exists (
      select 1
      from public.associations a
      join public.accounts_memberships am on am.account_id = a.account_id
      where a.id = p_association_id
        and am.user_id = auth.uid()
    );
$$;

-- ── association_role ─────────────────────────────────────────
-- Returns the current user's role in the given association, or
-- 'assoc_admin' when the caller is a platform super-admin.
create or replace function public.association_role(p_association_id uuid)
returns text
language sql
security definer
stable
as $$
  select
    case
      when public.is_super_admin() then 'assoc_admin'
      else (
        select am.account_role
        from public.associations a
        join public.accounts_memberships am on am.account_id = a.account_id
        where a.id = p_association_id
          and am.user_id = auth.uid()
        limit 1
      )
    end;
$$;
