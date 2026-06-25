-- =============================================================
-- Invite form: capture invitee name + email at invite time
-- -------------------------------------------------------------
-- Extends invite_to_association_by_phone with optional p_name
-- and p_email parameters so the association admin can pre-fill
-- the invitee's profile details when sending a phone invite.
-- =============================================================

-- ── 1. Add invitee_name to invitations ────────────────────────
alter table public.invitations
  add column if not exists invitee_name varchar(255);

-- ── 2. Rebuild invite_to_association_by_phone ─────────────────
create or replace function public.invite_to_association_by_phone(
  account_slug text,
  p_phone      text,
  p_role       varchar,
  invited_by   uuid,
  p_name       text default null,
  p_email      text default null
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
        and user_id    = v_user_id
    ) then
      return 'already_member';
    end if;

    insert into public.accounts_memberships (user_id, account_id, account_role)
    values (v_user_id, v_account_id, p_role);

    -- Pre-populate the existing user's profile with name/email only when
    -- those fields are currently blank, so we never overwrite existing data.
    if p_name is not null or p_email is not null then
      update public.profiles
         set full_name = coalesce(nullif(trim(full_name), ''), p_name),
             email     = coalesce(email, p_email)
       where id = v_user_id;
    end if;

    return 'added';
  end if;

  -- No account yet — store a pending invite, claimed on first sign-in.
  v_token := extensions.uuid_generate_v4();

  insert into public.invitations
    (phone, account_id, invited_by, role, invite_token, invitee_name, email)
  values
    (p_phone, v_account_id, invited_by, p_role, v_token, p_name, p_email)
  on conflict (account_id, phone) do update
    set role         = excluded.role,
        invite_token = excluded.invite_token,
        invited_by   = excluded.invited_by,
        expires_at   = now() + interval '7 days',
        -- Preserve existing name/email if inviter didn't supply new ones
        invitee_name = coalesce(excluded.invitee_name, invitations.invitee_name),
        email        = coalesce(excluded.email, invitations.email);

  return 'invited';
end;
$$;

-- Grant the new 6-arg overload to service_role (admin client)
grant execute
  on function public.invite_to_association_by_phone(text, text, varchar, uuid, text, text)
  to service_role;
