-- =============================================================
-- Phone-based membership & invitations
--
-- This app authenticates with phone OTP only — users have no email.
-- The stock MakerKit invite flow is email-based (emails an invite link),
-- which cannot work here. This migration reworks invitations around the
-- phone number:
--
--   * `profiles.mobile_number` becomes the canonical phone identity and is
--     populated automatically on sign-up (and backfilled for existing users).
--   * Inviting a phone number that already has an account adds the user to the
--     association's `accounts_memberships` immediately.
--   * Inviting a phone number with no account yet stores a pending invitation
--     keyed by phone; it is claimed automatically the first time that phone
--     signs in (no email link required).
--   * Association members can read each other's phone numbers (for the members
--     list); previously profiles were strictly self-only.
-- =============================================================

-- ─── INVITATIONS: support phone ──────────────────────────────
-- Email is no longer guaranteed (phone-only app), so it becomes optional and
-- we add a phone column with the same per-account uniqueness guarantee.
alter table public.invitations
  alter column email drop not null;

alter table public.invitations
  add column if not exists phone varchar(20);

comment on column public.invitations.phone is
  'The phone number of the user being invited (phone-OTP app). One of email/phone is set.';

create unique index if not exists invitations_account_phone_unique
  on public.invitations (account_id, phone)
  where phone is not null;

-- Authenticated members may read the phone column (mirrors the existing
-- column-level grant that intentionally withholds invite_token).
grant select (phone) on table public.invitations to authenticated;

-- ─── PROFILES: phone identity + co-member visibility ─────────
-- Backfill the canonical phone identity from auth.users.phone. Supabase stores
-- the phone in E.164 without a leading '+'; we keep '+<digits>' in profiles.
update public.profiles p
set mobile_number = '+' || u.phone
from auth.users u
where u.id = p.id
  and p.mobile_number is null
  and u.phone is not null
  and u.phone <> '';

-- Allow members of the same association to read each other's profile (needed to
-- show the phone number in the members list). The existing "own_profile" policy
-- still covers writes; this is an additive SELECT policy.
create policy "profiles_read_account_members" on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.accounts_memberships self
      join public.accounts_memberships other
        on other.account_id = self.account_id
      where self.user_id = (select auth.uid())
        and other.user_id = public.profiles.id
    )
  );

-- ─── SIGN-UP: set phone identity + claim pending invites ─────
-- Replaces the Phase-1 trigger function: in addition to creating the profile,
-- it records the phone identity and claims any pending phone invitations.
create or replace function public.create_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  v_phone := case
    when new.phone is null or new.phone = '' then null
    when new.phone like '+%' then new.phone
    else '+' || new.phone
  end;

  insert into public.profiles (id, full_name, mobile_number)
  values (new.id, new.raw_user_meta_data ->> 'full_name', v_phone)
  on conflict (id) do update
    set mobile_number = coalesce(public.profiles.mobile_number, excluded.mobile_number);

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

-- ─── INVITE BY PHONE ─────────────────────────────────────────
-- Adds an existing user to the association immediately, or stores a pending
-- phone invitation. Called from the invite server action with the admin client
-- after permission/role-hierarchy checks. Returns the outcome for the caller.
create or replace function public.invite_to_association_by_phone(
  account_slug text,
  p_phone text,
  p_role varchar,
  invited_by uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_user_id uuid;
  v_token text;
begin
  select id into v_account_id
  from public.accounts
  where slug = account_slug
    and is_personal_account = false;

  if v_account_id is null then
    raise exception 'Association not found for slug %', account_slug;
  end if;

  -- Resolve an existing user by phone. profiles.mobile_number is canonical
  -- ('+91…'); fall back to auth.users.phone (stored without '+').
  select p.id into v_user_id
  from public.profiles p
  where p.mobile_number = p_phone;

  if v_user_id is null then
    select u.id into v_user_id
    from auth.users u
    where u.phone = replace(p_phone, '+', '');
  end if;

  if v_user_id is not null then
    if exists (
      select 1
      from public.accounts_memberships
      where account_id = v_account_id
        and user_id = v_user_id
    ) then
      return 'already_member';
    end if;

    insert into public.accounts_memberships (user_id, account_id, account_role)
    values (v_user_id, v_account_id, p_role);

    return 'added';
  end if;

  -- No account yet — store a pending invite, claimed on first sign-in.
  v_token := extensions.uuid_generate_v4();

  insert into public.invitations (phone, account_id, invited_by, role, invite_token)
  values (p_phone, v_account_id, invited_by, p_role, v_token)
  on conflict (account_id, phone) do update
    set role = excluded.role,
        invite_token = excluded.invite_token,
        invited_by = excluded.invited_by,
        expires_at = now() + interval '7 days';

  return 'invited';
end;
$$;

grant execute on function public.invite_to_association_by_phone(text, text, varchar, uuid)
  to service_role;

-- ─── INVITATIONS LIST: surface phone ─────────────────────────
-- Keep the existing return shape (so generated types are unchanged) but expose
-- the phone number through the `email` field for phone invites, so the pending
-- invitations table shows a usable identifier.
create or replace function public.get_account_invitations (account_slug text)
returns table (
  id integer,
  email varchar(255),
  account_id uuid,
  invited_by uuid,
  role varchar(50),
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  inviter_name varchar,
  inviter_email varchar
)
set search_path = ''
as $$
begin
  return query
  select
    invitation.id,
    coalesce(invitation.email, invitation.phone)::varchar(255),
    invitation.account_id,
    invitation.invited_by,
    invitation.role,
    invitation.created_at,
    invitation.updated_at,
    invitation.expires_at,
    account.name,
    account.email
  from
    public.invitations as invitation
    join public.accounts as account on invitation.account_id = account.id
  where
    account.slug = account_slug;
end;
$$ language plpgsql;

grant execute on function public.get_account_invitations (text) to authenticated, service_role;
