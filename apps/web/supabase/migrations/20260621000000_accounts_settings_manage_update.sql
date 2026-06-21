-- =============================================================
-- Allow association admins (settings.manage) to update their account
--
-- The stock `accounts_self_update` policy only lets the PRIMARY OWNER update a
-- team account row (auth.uid() = primary_owner_user_id). But this app gives
-- association settings to every `assoc_admin`, and the `account_image` storage
-- bucket already lets anyone with the `settings.manage` permission write the
-- logo file. That mismatch meant a non-owner admin could overwrite the logo
-- file in storage yet silently fail to persist `accounts.picture_url`
-- (a PostgREST UPDATE filtered out by RLS affects 0 rows and returns NO error),
-- so the logo, the "Clear" action, and the association name edit all appeared
-- to succeed but reverted on the next read.
--
-- This adds a second, permissive UPDATE policy that mirrors the storage bucket:
-- any member with `settings.manage` on the account may update it. RLS policies
-- are OR-ed, so the existing owner policy is preserved. The columns that must
-- never change (id, is_personal_account, primary_owner_user_id, email) remain
-- protected by the `kit.protect_account_fields` trigger, which raises on any
-- attempt to alter them — so this only widens access to the editable settings
-- fields (name, picture_url, public_data).
-- =============================================================

-- Idempotent: this was first applied by hand via the SQL editor (which does not
-- record a row in supabase_migrations.schema_migrations), so a later
-- `supabase db push` would otherwise re-run this file and fail on a duplicate
-- policy. Dropping first makes the migration safe to apply in any environment.
drop policy if exists accounts_settings_manage_update on public.accounts;

create policy accounts_settings_manage_update on public.accounts
  for update
  to authenticated
  using (
    public.has_permission(
      (select auth.uid()),
      id,
      'settings.manage'
    )
  )
  with check (
    public.has_permission(
      (select auth.uid()),
      id,
      'settings.manage'
    )
  );
