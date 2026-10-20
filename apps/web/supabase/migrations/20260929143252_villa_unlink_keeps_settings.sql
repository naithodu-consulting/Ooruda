-- =============================================================
-- Ooruda Villa — disconnecting a booking site keeps the villa's settings
--
-- Until now "Disconnect" deleted the villa_properties row, and M2's add-ons
-- and emergency contacts cascade-deleted with it: rotating to a new booking
-- site, or undoing a wrong link, silently wiped the owner's settings.
--
-- Now:
--   * disconnect_villa_property() UNLINKS: clears the site link, deletes the
--     stored key, keeps the property and everything hanging off it
--   * connect_villa_property() can RE-LINK a given unlinked property
--     (p_property_id) instead of creating a duplicate
--
-- connect_villa_property previous definition:
--   20260929091855_villa_m1_site_connection.sql. Changes, and only these:
--   + p_property_id uuid default null (last parameter). The old 7-argument
--     signature is DROPPED first so no ambiguous overload remains.
--   + when p_property_id is given, that property (of this account) is linked
--     instead of inserting a new row
-- =============================================================

drop function if exists public.connect_villa_property(uuid, text, text, uuid, text, text, text);

create function public.connect_villa_property(
  p_account_id          uuid,
  p_site_url            text,
  p_site_project_ref    text,
  p_site_property_id    uuid,
  p_booking_code_prefix text,
  p_name                text,
  p_service_key         text,
  p_property_id         uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_owner  uuid;
  v_ref    uuid;
  v_secret text;
begin
  if p_site_url !~ '^https?://' then
    raise exception 'The site URL must start with https://';
  end if;

  if length(coalesce(p_service_key, '')) < 20 then
    raise exception 'The service key looks invalid';
  end if;

  if p_site_property_id is null or coalesce(p_site_project_ref, '') = '' then
    raise exception 'The site property is required';
  end if;

  -- Serialise concurrent connects of the same site property.
  perform pg_advisory_xact_lock(
    hashtext(p_site_project_ref || ':' || p_site_property_id::text));

  select id, account_id, site_credentials_ref
    into v_id, v_owner, v_ref
  from public.villa_properties
  where site_project_ref = p_site_project_ref
    and site_property_id = p_site_property_id
  for update;

  if v_id is not null and v_owner <> p_account_id then
    raise exception 'That booking-site property is already connected to another villa account'
      using errcode = 'unique_violation';
  end if;

  if p_property_id is not null then
    if v_id is not null and v_id <> p_property_id then
      raise exception 'That booking-site property is already connected to another villa property'
        using errcode = 'unique_violation';
    end if;

    -- Re-link a property this account already has (its settings are kept).
    select id, site_credentials_ref into v_id, v_ref
    from public.villa_properties
    where id = p_property_id and account_id = p_account_id
    for update;

    if v_id is null then
      raise exception 'Villa property not found for this account';
    end if;

    update public.villa_properties
    set site_project_ref    = p_site_project_ref,
        site_property_id    = p_site_property_id,
        booking_code_prefix = p_booking_code_prefix
    where id = v_id;
  elsif v_id is null then
    insert into public.villa_properties (
      account_id, name, site_project_ref, site_property_id, booking_code_prefix)
    values (
      p_account_id,
      coalesce(nullif(trim(p_name), ''), 'Villa'),
      p_site_project_ref,
      p_site_property_id,
      p_booking_code_prefix)
    returning id into v_id;
  else
    update public.villa_properties
    set booking_code_prefix = p_booking_code_prefix
    where id = v_id;
  end if;

  v_secret := jsonb_build_object('url', p_site_url, 'service_key', p_service_key)::text;

  if v_ref is null then
    v_ref := vault.create_secret(
      v_secret,
      'villa_site_credentials:' || v_id::text,
      'villa-booking service credentials for a villa property');

    update public.villa_properties
    set site_credentials_ref = v_ref
    where id = v_id;
  else
    perform vault.update_secret(v_ref, v_secret);
  end if;

  return v_id;
end;
$$;

-- Unlinks a property from its booking site and deletes its key. The property
-- row — and its add-ons, contacts and history — stay.
create or replace function public.disconnect_villa_property(
  p_account_id  uuid,
  p_property_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref uuid;
begin
  select site_credentials_ref into v_ref
  from public.villa_properties
  where id = p_property_id and account_id = p_account_id
  for update;

  if not found then
    raise exception 'Villa property not found for this account';
  end if;

  update public.villa_properties
  set site_property_id     = null,
      site_project_ref     = null,
      site_credentials_ref = null
  where id = p_property_id;

  if v_ref is not null then
    delete from vault.secrets where id = v_ref;
  end if;
end;
$$;

revoke all on function public.connect_villa_property(uuid, text, text, uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.disconnect_villa_property(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.connect_villa_property(uuid, text, text, uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.disconnect_villa_property(uuid, uuid) to service_role;
