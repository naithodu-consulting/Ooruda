-- =============================================================
-- Email identity on profiles (secondary email-OTP login)
-- -------------------------------------------------------------
-- The app authenticates primarily via phone OTP, but we now add
-- email OTP as a secondary login channel. A single auth.users row
-- carries BOTH phone and email; logging in with either resolves to
-- the same account. `profiles.email` mirrors `auth.users.email` so
-- the app can (a) gate email login to existing users, (b) enforce
-- uniqueness, and (c) show co-members' email in the members list.
--
-- Email is nullable for now: legacy phone-only users have none and
-- are forced to add one on next login (handled in the app layer).
-- NULLs do not collide under the unique constraint, so legacy rows
-- coexist with the uniqueness guarantee for real addresses.
-- =============================================================

-- ─── PROFILES: email identity ────────────────────────────────
alter table public.profiles
  add column if not exists email text unique;

comment on column public.profiles.email is
  'Email OTP login identity, mirrored from auth.users.email. Unique; nullable for legacy phone-only users until backfilled.';

-- Backfill from auth.users for any user that already has an email.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null
  and u.email is not null
  and u.email <> '';

-- ─── SIGN-UP: also capture the email identity ────────────────
-- Re-declares create_profile_on_signup (canonical version lives in
-- 20260618000001) to additionally persist the email on first insert,
-- alongside the existing phone-claim behaviour.
create or replace function public.create_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_email text;
begin
  v_phone := case
    when new.phone is null or new.phone = '' then null
    when new.phone like '+%' then new.phone
    else '+' || new.phone
  end;

  v_email := nullif(new.email, '');

  insert into public.profiles (id, full_name, mobile_number, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', v_phone, v_email)
  on conflict (id) do update
    set mobile_number = coalesce(public.profiles.mobile_number, excluded.mobile_number),
        email         = coalesce(public.profiles.email, excluded.email);

  -- Claim any pending phone invitations: add the new user to the inviting
  -- associations directly, then delete the consumed invites.
  if v_phone is not null then
    insert into public.accounts_memberships (user_id, account_id, account_role)
    select new.id, i.account_id, i.role
    from public.invitations i
    where i.phone = v_phone
      and i.expires_at > now()
    on conflict (user_id, account_id) do nothing;

    delete from public.invitations i
    where i.phone = v_phone;
  end if;

  return new;
end;
$$;

-- ─── EMAIL CHANGE: keep profiles.email in sync ───────────────
-- When a user adds or changes their email (self-service update or admin
-- edit), GoTrue updates auth.users.email once confirmed. Mirror it onto
-- profiles so the login gate and members list stay consistent.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
    set email = nullif(new.email, '')
    where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_email on auth.users;

create trigger trg_sync_profile_email
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sync_profile_email();
