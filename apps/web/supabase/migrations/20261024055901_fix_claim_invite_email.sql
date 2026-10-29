-- =============================================================
-- Fix: claiming a pending phone invite copied the invitee's
-- pre-captured NAME into the new profile but never the EMAIL.
--
-- 20260709000000_fix_claim_invite_full_name.sql added the
-- full_name backfill before the claimed invitations are deleted,
-- but invitations.email (captured by the invite form since
-- 20260630000000_invite_name_email.sql) was left behind and lost
-- with the deleted row. An existing user invited by phone does
-- get both, via invite_to_association_by_phone; only a brand-new
-- sign-up claiming a pending invite dropped the email, showing a
-- blank Email column on the members and admin screens.
--
-- Diffed against the 20260709000000 definition: the ONLY change
-- is that the backfill below also sets email. Everything else —
-- the profile insert, the membership claim, the delete — is
-- carried over verbatim.
-- =============================================================

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
    -- Backfill the invitee's pre-captured name AND email before the
    -- invitations claiming them are deleted below. Neither overwrites a
    -- value the sign-up itself supplied.
    update public.profiles p
    set full_name = coalesce(nullif(trim(p.full_name), ''), i.invitee_name),
        email     = coalesce(nullif(trim(p.email), ''), i.email)
    from public.invitations i
    where p.id = new.id
      and i.phone = v_phone
      and (i.invitee_name is not null or i.email is not null);

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
