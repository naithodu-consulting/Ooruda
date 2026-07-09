-- =============================================================
-- Super Admin: account name/logo write access
-- -------------------------------------------------------------
-- Super admins can navigate into any association workspace, but
-- the `accounts_settings_manage_update` RLS policy and the
-- `account_image` storage policy both gate on
-- `public.has_permission(...)`, which checks accounts_memberships
-- and returns false for a super admin who is not an actual member.
-- This caused "Couldn't save your changes" for the name form and
-- a silent failure for the logo uploader.
--
-- Fix: add `public.is_super_admin()` OR-branches to both policies.
-- =============================================================

-- ── accounts UPDATE ──────────────────────────────────────────
drop policy if exists accounts_settings_manage_update on public.accounts;

create policy accounts_settings_manage_update on public.accounts
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(
      (select auth.uid()),
      id,
      'settings.manage'
    )
  )
  with check (
    public.is_super_admin()
    or public.has_permission(
      (select auth.uid()),
      id,
      'settings.manage'
    )
  );

-- ── storage.objects (account_image bucket) ───────────────────
drop policy if exists account_image on storage.objects;

create policy account_image on storage.objects
  for all
  using (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_role_on_account(kit.get_storage_filename_as_uuid(name))
    )
  )
  with check (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.is_super_admin()
      or public.has_permission(
        auth.uid(),
        kit.get_storage_filename_as_uuid(name),
        'settings.manage'
      )
    )
  );
