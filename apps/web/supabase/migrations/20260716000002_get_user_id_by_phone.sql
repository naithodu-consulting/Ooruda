-- Helpers for the bulk-invite flow: look up an auth.users row by phone or
-- email. Used to recover gracefully when createUser fails with an already-
-- exists error (user exists in auth but not in profiles.mobile_number/email).
-- Restricted to service_role only — never exposed to authenticated users.

create or replace function public.get_user_id_by_phone(p_phone text)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from auth.users where phone = p_phone limit 1;
$$;

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from auth.users where email = p_email limit 1;
$$;

revoke all on function public.get_user_id_by_phone(text) from public, authenticated;
revoke all on function public.get_user_id_by_email(text) from public, authenticated;
grant execute on function public.get_user_id_by_phone(text) to service_role;
grant execute on function public.get_user_id_by_email(text) to service_role;
