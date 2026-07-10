-- Batch lookup for the bulk-invite flow: find existing auth.users rows by
-- phone OR email in a single round-trip. Allows the upfront lookup to catch
-- ALL existing users before createUser is attempted, regardless of whether
-- their profiles.mobile_number / profiles.email is populated.
-- Restricted to service_role only — never exposed to authenticated users.
create or replace function public.find_users_by_phones_or_emails(
  p_phones text[],
  p_emails text[]
)
returns table (id uuid, phone text, email text)
language sql
security definer
stable
set search_path = ''
as $$
  select id, phone, email
  from auth.users
  where
    (phone is not null and phone = any(p_phones))
    or
    (email is not null and email = any(p_emails));
$$;

revoke all on function public.find_users_by_phones_or_emails(text[], text[]) from public, authenticated;
grant execute on function public.find_users_by_phones_or_emails(text[], text[]) to service_role;
