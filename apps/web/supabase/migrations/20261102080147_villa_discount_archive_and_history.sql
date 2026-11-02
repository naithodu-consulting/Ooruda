-- =============================================================
-- Villa discount codes — archiving and a readable history
--
-- Deleting a code was never offered, and must not be: the booking mirror
-- records the code a guest used as TEXT (villa_bookings_mirror.discount_code),
-- and villa_discount_audit.code_id cascades on delete. Removing the row would
-- turn past bookings into "₹2,000 off, code unknown" and take the audit trail
-- with it.
--
-- So a code retires instead: status 'archived'. It is terminal — a code cannot
-- come back, because its code string stays reserved (unique (property_id,
-- code)) so the usage figures, which match by text, can never become
-- ambiguous. Archiving is published like a pause: the service drops the row
-- from the booking site's discount_codes, so it stops working at checkout.
--
-- The audit table already recorded every action with a full snapshot of the
-- terms. Two things are added for the history screen:
--   * 'archived' as an action
--   * actor_name, denormalised at write time. The actor FK is
--     `on delete set null`, and names were resolved from profiles at read
--     time, so removing a member rewrote their past entries to "Unknown".
--     The history must stay true years later.
-- =============================================================

-- ── 'archived' status ─────────────────────────────────────────
alter table public.villa_discount_codes
  drop constraint if exists villa_discount_codes_status_check;

alter table public.villa_discount_codes
  add constraint villa_discount_codes_status_check
  check (status in ('pending_approval', 'active', 'paused', 'rejected', 'archived'));

alter table public.villa_discount_audit
  drop constraint if exists villa_discount_audit_action_check;

alter table public.villa_discount_audit
  add constraint villa_discount_audit_action_check
  check (action in ('created', 'updated', 'paused', 'resumed', 'approved', 'rejected', 'archived'));

-- ── Who did it, kept forever ──────────────────────────────────
alter table public.villa_discount_audit
  add column if not exists actor_name text;

update public.villa_discount_audit a
set actor_name = p.full_name
from public.profiles p
where p.id = a.actor
  and a.actor_name is null
  and p.full_name is not null;

-- Same shape as before, plus the actor's name as it is NOW. Read the old
-- definition before changing this again: it is the only writer of the audit.
create or replace function kit.villa_discount_log(
  p_row    public.villa_discount_codes,
  p_action text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.villa_discount_audit (account_id, code_id, action, terms, actor, actor_name)
  values (
    p_row.account_id, p_row.id, p_action,
    to_jsonb(p_row) - 'account_id' - 'property_id' - 'created_at' - 'updated_at',
    (select auth.uid()),
    (select p.full_name from public.profiles p where p.id = (select auth.uid()))
  );
$$;

revoke all on function kit.villa_discount_log(public.villa_discount_codes, text) from public;

-- ── Archive ───────────────────────────────────────────────────
-- One way. Any status may be archived (a refused code is retired the same
-- way); an archived one cannot be edited, paused, resumed or reviewed, which
-- the write functions below refuse. The permission message is the standard
-- villa one, as 20261020115735 made it.
create or replace function public.archive_villa_discount(p_id uuid)
returns public.villa_discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.villa_discount_codes;
begin
  select * into v_row from public.villa_discount_codes where id = p_id for update;

  if v_row.id is null or public.villa_role(v_row.account_id) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  if v_row.status = 'archived' then
    raise exception 'That code is already archived.' using errcode = '22023';
  end if;

  update public.villa_discount_codes
  set status = 'archived'
  where id = p_id
  returning * into v_row;

  perform kit.villa_discount_log(v_row, 'archived');
  return v_row;
end;
$$;

revoke all on function public.archive_villa_discount(uuid) from public, anon;
grant execute on function public.archive_villa_discount(uuid) to authenticated;

-- ── An archived code is read-only ─────────────────────────────
-- These two are re-created ONLY to add the archived guard. They are copied
-- from their CURRENT definitions in 20261020115735_villa_rename_owner_to_admin
-- (§6 and §7) — NOT from 20260930052559, which that migration superseded when
-- it renamed villa_owner → villa_admin and replaced the permission message.
-- Re-creating from the older file would have silently reverted both, which is
-- the hazard CLAUDE.md records for security functions. The only difference
-- from §6/§7 is the one `status = 'archived'` guard in each.

create or replace function public.save_villa_discount(
  p_id                 uuid,
  p_property_id        uuid,
  p_code               text,
  p_discount_type      text,
  p_discount_value     numeric,
  p_max_discount       numeric,
  p_valid_from         date,
  p_valid_to           date,
  p_min_nights         smallint,
  p_min_booking_value  numeric,
  p_max_uses           integer,
  p_max_uses_per_guest smallint,
  p_blackouts          jsonb,
  p_note               text
)
returns public.villa_discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_old     public.villa_discount_codes;
  v_row     public.villa_discount_codes;
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_b       jsonb;
begin
  select account_id into v_account from public.villa_properties where id = p_property_id;

  if v_account is null or public.villa_role(v_account) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_blackouts, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_blackouts, '[]'::jsonb)) > 30 then
    raise exception 'Up to 30 blackout ranges.' using errcode = '22023';
  end if;

  for v_b in select * from jsonb_array_elements(coalesce(p_blackouts, '[]'::jsonb)) loop
    if (v_b ->> 'start') !~ '^\d{4}-\d{2}-\d{2}$' or (v_b ->> 'end') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_b ->> 'end')::date <= (v_b ->> 'start')::date then
      raise exception 'Each blackout needs a start and an end after it.' using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'start', ((b ->> 'start')::date)::text,
           'end', ((b ->> 'end')::date)::text)), '[]'::jsonb)
    into p_blackouts
    from jsonb_array_elements(coalesce(p_blackouts, '[]'::jsonb)) b;

  if p_id is null then
    insert into public.villa_discount_codes (
      account_id, property_id, code, discount_type, discount_value, max_discount,
      valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest,
      blackouts, note, status, created_by
    ) values (
      v_account, p_property_id, v_code, p_discount_type, p_discount_value, p_max_discount,
      p_valid_from, p_valid_to, coalesce(p_min_nights, 1), coalesce(p_min_booking_value, 0),
      p_max_uses, coalesce(p_max_uses_per_guest, 1),
      coalesce(p_blackouts, '[]'::jsonb), nullif(btrim(p_note), ''),
      'paused', (select auth.uid())
    )
    returning * into v_row;

    update public.villa_discount_codes
    set status = case when needs_approval then 'pending_approval' else 'active' end
    where id = v_row.id
    returning * into v_row;

    perform kit.villa_discount_log(v_row, 'created');
    return v_row;
  end if;

  select * into v_old from public.villa_discount_codes
  where id = p_id and property_id = p_property_id
  for update;

  if v_old.id is null then
    raise exception 'That code no longer exists.' using errcode = '22023';
  end if;

  -- An archived code is history: it cannot be edited back into use.
  if v_old.status = 'archived' then
    raise exception 'This code is archived. Create a new code instead.' using errcode = '22023';
  end if;

  update public.villa_discount_codes set
    code = v_code,
    discount_type = p_discount_type,
    discount_value = p_discount_value,
    max_discount = p_max_discount,
    valid_from = p_valid_from,
    valid_to = p_valid_to,
    min_nights = coalesce(p_min_nights, 1),
    min_booking_value = coalesce(p_min_booking_value, 0),
    max_uses = p_max_uses,
    max_uses_per_guest = coalesce(p_max_uses_per_guest, 1),
    blackouts = coalesce(p_blackouts, '[]'::jsonb),
    note = nullif(btrim(p_note), ''),
    approved_by = null,
    approved_at = null,
    status = 'paused'
  where id = p_id
  returning * into v_row;

  update public.villa_discount_codes
  set status = case
    when needs_approval then 'pending_approval'
    when v_old.status = 'paused' then 'paused'
    else 'active'
  end
  where id = p_id
  returning * into v_row;

  perform kit.villa_discount_log(v_row, 'updated');
  return v_row;
end;
$$;

create or replace function public.set_villa_discount_active(
  p_id     uuid,
  p_active boolean
)
returns public.villa_discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.villa_discount_codes;
begin
  select * into v_row from public.villa_discount_codes where id = p_id for update;

  if v_row.id is null or public.villa_role(v_row.account_id) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  if v_row.status = 'archived' then
    raise exception 'This code is archived. Create a new code instead.' using errcode = '22023';
  end if;

  if v_row.status in ('pending_approval', 'rejected') then
    raise exception 'This code is waiting for (or was refused) Ooruda approval.' using errcode = '22023';
  end if;

  update public.villa_discount_codes
  set status = case when p_active then 'active' else 'paused' end
  where id = p_id
  returning * into v_row;

  perform kit.villa_discount_log(v_row, case when p_active then 'resumed' else 'paused' end);
  return v_row;
end;
$$;

revoke all on function public.save_villa_discount(uuid, uuid, text, text, numeric, numeric, date, date, smallint, numeric, integer, smallint, jsonb, text) from public, anon;
grant execute on function public.save_villa_discount(uuid, uuid, text, text, numeric, numeric, date, date, smallint, numeric, integer, smallint, jsonb, text) to authenticated;

revoke all on function public.set_villa_discount_active(uuid, boolean) from public, anon;
grant execute on function public.set_villa_discount_active(uuid, boolean) to authenticated;
