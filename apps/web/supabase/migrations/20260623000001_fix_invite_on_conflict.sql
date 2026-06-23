-- =============================================================
-- Fix invite_to_association_by_phone ON CONFLICT clause
--
-- The previous implementation used ON CONFLICT (account_id, phone) but
-- only a partial unique index existed (WHERE phone IS NOT NULL).
-- PostgreSQL requires a full constraint or a matching partial index
-- predicate for ON CONFLICT to work. This migration rewrites the RPC to
-- use an explicit conflict target predicate, and also handles the case
-- where an existing invitation for the same phone+account already exists
-- using a manual check-then-update approach which is more compatible.
-- =============================================================

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
  v_user_id    uuid;
  v_token      text;
  v_existing   int;
begin
  -- 1. Resolve account
  select id into v_account_id
  from public.accounts
  where slug = account_slug
    and is_personal_account = false;

  if v_account_id is null then
    raise exception 'Association not found for slug %', account_slug;
  end if;

  -- 2. Resolve an existing user by phone
  select p.id into v_user_id
  from public.profiles p
  where p.mobile_number = p_phone;

  if v_user_id is null then
    select u.id into v_user_id
    from auth.users u
    where u.phone = replace(p_phone, '+', '');
  end if;

  -- 3a. User already exists → add to membership immediately
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

  -- 3b. No user yet → upsert a pending invitation keyed on phone + account.
  -- We do a manual check-then-upsert to avoid relying on ON CONFLICT with a
  -- partial index (which Supabase currently rejects with error 42P10).
  select id into v_existing
  from public.invitations
  where account_id = v_account_id
    and phone = p_phone;

  if v_existing is not null then
    -- Update the existing pending invite
    update public.invitations
    set role        = p_role,
        invite_token = extensions.uuid_generate_v4(),
        invited_by   = invite_to_association_by_phone.invited_by,
        expires_at   = now() + interval '7 days'
    where id = v_existing;
  else
    -- Insert a fresh pending invite
    v_token := extensions.uuid_generate_v4();
    insert into public.invitations (phone, account_id, invited_by, role, invite_token)
    values (p_phone, v_account_id, invite_to_association_by_phone.invited_by, p_role, v_token);
  end if;

  return 'invited';
end;
$$;

grant execute on function public.invite_to_association_by_phone(text, text, varchar, uuid)
  to service_role;
