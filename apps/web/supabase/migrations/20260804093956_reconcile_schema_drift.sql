-- 1. Drop superseded individual lookup functions (replaced by find_users_by_phones_or_emails)
drop function if exists public.get_user_id_by_email(text);
drop function if exists public.get_user_id_by_phone(text);

-- 2. Canonicalize account_image storage policy to the production-correct version
drop policy if exists "account_image" on "storage"."objects";
create policy "account_image"
on "storage"."objects"
as permissive
for all
to public
using (
  (bucket_id = 'account_image'::text)
  and (
    (kit.get_storage_filename_as_uuid(name) = auth.uid())
    or public.has_role_on_account(kit.get_storage_filename_as_uuid(name))
  )
)
with check (
  (bucket_id = 'account_image'::text)
  and (
    (kit.get_storage_filename_as_uuid(name) = auth.uid())
    or public.is_super_admin()
    or public.has_permission(
      auth.uid(),
      kit.get_storage_filename_as_uuid(name),
      'settings.manage'::public.app_permissions
    )
  )
);

-- 3. Close the anon grants gap permanently
-- Revoke existing anon table access accumulated since initial setup
revoke all privileges on all tables in schema public from anon;
-- Block future tables from inheriting platform-default anon grants
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;