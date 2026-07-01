-- =============================================================
-- Super admin profile visibility during workspace deep-linking
-- -------------------------------------------------------------
-- "profiles_read_account_members" (20260618000001_phone_invitations.sql)
-- only grants SELECT when the caller shares an accounts_memberships
-- row with the target profile's account. A super admin browsing an
-- association via deep-linking (20260708000000_super_admin_association_access.sql)
-- has no membership row there, so this policy silently returned zero
-- rows for that association's owners/tenants — surfacing as
-- "Member <id>" / raw-id fallbacks in the units UI, even though the
-- underlying profiles have real names.
--
-- Fix: mirror the is_association_member()/association_role() pattern
-- and let a platform super-admin bypass the membership check here too.
-- =============================================================

drop policy if exists "profiles_read_account_members" on public.profiles;

create policy "profiles_read_account_members" on public.profiles
  for select
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.accounts_memberships self
      join public.accounts_memberships other
        on other.account_id = self.account_id
      where self.user_id = (select auth.uid())
        and other.user_id = public.profiles.id
    )
  );
