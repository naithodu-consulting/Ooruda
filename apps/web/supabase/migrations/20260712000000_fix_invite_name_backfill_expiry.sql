-- =============================================================
-- Fix invite-name backfill: expiry filter + determinism
-- -------------------------------------------------------------
-- 20260709000000_fix_claim_invite_full_name.sql added a step to
-- create_profile_on_signup() that copies invitations.invitee_name into
-- the new profile's full_name when claiming a pending phone invite. Two
-- gaps in that first fix:
--
-- 1. The backfill UPDATE joined `invitations` on phone only, without the
--    `expires_at > now()` filter the membership INSERT (a few lines
--    below it) already uses. An expired invite's name could still leak
--    into a profile even though its membership grant is correctly
--    skipped for being expired.
-- 2. `phone` is only unique per (account_id, phone), not globally — two
--    different associations can have live pending invites for the same
--    phone with different invitee_name values. UPDATE...FROM with a
--    multi-row match has no defined tie-break, so it could pick either.
--    Break the tie deterministically by taking the most recent invite.
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
    -- Backfill the invitee's pre-captured name before the invitations
    -- claiming them are deleted below. Only consider non-expired invites,
    -- and break ties on multiple matches by taking the most recent one.
    update public.profiles p
    set full_name = coalesce(
      nullif(trim(p.full_name), ''),
      (
        select i.invitee_name
        from public.invitations i
        where i.phone = v_phone
          and i.expires_at > now()
          and i.invitee_name is not null
        order by i.created_at desc
        limit 1
      )
    )
    where p.id = new.id;

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
