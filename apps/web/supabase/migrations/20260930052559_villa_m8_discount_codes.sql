-- =============================================================
-- Ooruda Villa M8a — discount codes, Ooruda's half (OORUDA_VILLA_PLAN.md §10)
--
-- Ooruda DEFINES and APPROVES codes and keeps the audit trail. The booking
-- site ENFORCES and COUNTS them at checkout (villa-booking TODO 1); until
-- that lands, codes here are not published anywhere (the feature is dark
-- behind VILLA_DISCOUNTS). Publishing and redemption read-back are M8b.
--
--   villa_discount_codes  one code per villa: terms and guardrails. Writes
--                         only through the functions below.
--   villa_discount_audit  append-only: who created, changed, paused,
--                         approved or rejected what, and the terms at the time.
--
-- The 25% ceiling is enforced HERE, not in the screen: a code over it
-- (percent above 25, or a flat amount above 25% of its minimum booking
-- value) cannot be active without a super-admin's approval.
-- =============================================================

create table if not exists public.villa_discount_codes (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  account_id         uuid not null references public.accounts (id) on delete cascade,
  property_id        uuid not null references public.villa_properties (id) on delete cascade,
  code               text not null check (code ~ '^[A-Z0-9]{4,20}$'),
  discount_type      text not null check (discount_type in ('percent', 'flat')),
  -- percent: whole 1-100; flat: rupees
  -- 'NaN' is refused everywhere: numeric accepts it, and NaN compares above
  -- every number, which would slip past the ceiling.
  discount_value     numeric(12, 2) not null check (discount_value > 0 and discount_value <> 'NaN'),
  -- rupees; required for percent codes ("20% off" must not become ₹20,000)
  max_discount       numeric(12, 2) check (max_discount is null or (max_discount > 0 and max_discount <> 'NaN')),
  -- booking dates (the day the guest books), inclusive
  valid_from         date not null,
  valid_to           date not null,
  min_nights         smallint not null default 1 check (min_nights between 1 and 60),
  min_booking_value  numeric(12, 2) not null default 0 check (min_booking_value >= 0 and min_booking_value <> 'NaN'),
  max_uses           integer check (max_uses is null or max_uses > 0),
  max_uses_per_guest smallint not null default 1 check (max_uses_per_guest between 1 and 20),
  -- [{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}], end exclusive, like every
  -- stay range; nights inside a blackout cannot use the code
  blackouts          jsonb not null default '[]'::jsonb check (jsonb_typeof(blackouts) = 'array'),
  -- Direct website bookings only; never OTA-sourced ones. Fixed for now.
  channels           text[] not null default '{online}' check (channels = '{online}'),
  stackable          boolean not null default false check (not stackable),
  note               text check (note is null or length(note) <= 300),
  -- Fail closed: a code needs approval unless it is PROVABLY within 25%.
  needs_approval     boolean generated always as (
    not coalesce(
      (discount_type = 'percent' and discount_value <= 25)
      or (discount_type = 'flat' and min_booking_value > 0
          and discount_value <= min_booking_value * 0.25),
      false
    )
  ) stored,
  status             text not null check (status in ('pending_approval', 'active', 'paused', 'rejected')),
  -- No foreign key on purpose: deleting an approver's login must not fail
  -- (setting this null would break the ceiling check). The audit keeps who.
  approved_by        uuid,
  approved_at        timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (property_id, code),
  constraint villa_discount_codes_dates check (valid_to >= valid_from),
  constraint villa_discount_codes_percent check (
    discount_type <> 'percent'
    or (discount_value <= 100 and discount_value = trunc(discount_value) and max_discount is not null)
  ),
  -- The ceiling: over 25% is never active unless a super-admin approved it.
  constraint villa_discount_codes_ceiling check (
    status <> 'active' or not needs_approval or approved_by is not null
  )
);

create index if not exists villa_discount_codes_account_idx
  on public.villa_discount_codes (account_id);
create index if not exists villa_discount_codes_created_by_idx
  on public.villa_discount_codes (created_by);

create trigger villa_discount_codes_scope
  before insert or update of account_id, property_id on public.villa_discount_codes
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_discount_codes_updated_at
  before update on public.villa_discount_codes
  for each row execute function public.trigger_set_timestamps();

alter table public.villa_discount_codes enable row level security;
revoke all on public.villa_discount_codes from anon, authenticated, service_role;
grant select on public.villa_discount_codes to authenticated, service_role;

create policy villa_discount_codes_read on public.villa_discount_codes
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── Audit ─────────────────────────────────────────────────────
create table if not exists public.villa_discount_audit (
  id         uuid primary key default extensions.uuid_generate_v4(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  code_id    uuid not null references public.villa_discount_codes (id) on delete cascade,
  action     text not null check (action in ('created', 'updated', 'paused', 'resumed', 'approved', 'rejected')),
  -- the code's terms after the change
  terms      jsonb not null,
  actor      uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists villa_discount_audit_code_idx
  on public.villa_discount_audit (code_id, created_at);
create index if not exists villa_discount_audit_account_idx
  on public.villa_discount_audit (account_id);
create index if not exists villa_discount_audit_actor_idx
  on public.villa_discount_audit (actor);

alter table public.villa_discount_audit enable row level security;
revoke all on public.villa_discount_audit from anon, authenticated, service_role;
grant select on public.villa_discount_audit to authenticated, service_role;

create policy villa_discount_audit_read on public.villa_discount_audit
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

create or replace function kit.villa_discount_log(
  p_row    public.villa_discount_codes,
  p_action text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.villa_discount_audit (account_id, code_id, action, terms, actor)
  values (
    p_row.account_id, p_row.id, p_action,
    to_jsonb(p_row) - 'account_id' - 'property_id' - 'created_at' - 'updated_at',
    (select auth.uid())
  );
$$;

revoke all on function kit.villa_discount_log(public.villa_discount_codes, text) from public;

-- ── Writes ────────────────────────────────────────────────────

-- Create (p_id null) or change a code. Owner only. A code whose terms now
-- need approval goes to pending_approval, dropping any earlier approval:
-- an approved 30% code edited to 40% needs approving again.
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

  if v_account is null or public.villa_role(v_account) is distinct from 'villa_owner' then
    raise exception 'Only the villa owner can manage discount codes.' using errcode = '42501';
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

  -- Store only the two dates of each range, nothing else the caller sent.
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

    -- Active straight away when within the ceiling; else awaiting approval.
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
    -- any change of terms voids an earlier approval
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

revoke all on function public.save_villa_discount(uuid, uuid, text, text, numeric, numeric, date, date, smallint, numeric, integer, smallint, jsonb, text) from public, anon;
grant execute on function public.save_villa_discount(uuid, uuid, text, text, numeric, numeric, date, date, smallint, numeric, integer, smallint, jsonb, text) to authenticated;

-- Pause or resume. Owner only. Resuming a code over the ceiling needs its
-- approval to still stand (the table constraint refuses it otherwise).
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

  if v_row.id is null or public.villa_role(v_row.account_id) is distinct from 'villa_owner' then
    raise exception 'Only the villa owner can manage discount codes.' using errcode = '42501';
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

revoke all on function public.set_villa_discount_active(uuid, boolean) from public, anon;
grant execute on function public.set_villa_discount_active(uuid, boolean) to authenticated;

-- Approve or reject a code over the ceiling. Super-admin (Ooruda) only.
create or replace function public.review_villa_discount(
  p_id      uuid,
  p_approve boolean
)
returns public.villa_discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.villa_discount_codes;
begin
  if not public.is_super_admin() then
    raise exception 'Only Ooruda can approve codes above 25%%.' using errcode = '42501';
  end if;

  select * into v_row from public.villa_discount_codes where id = p_id for update;

  if v_row.id is null or v_row.status <> 'pending_approval' then
    raise exception 'That code is not waiting for approval.' using errcode = '22023';
  end if;

  update public.villa_discount_codes set
    status = case when p_approve then 'active' else 'rejected' end,
    approved_by = case when p_approve then (select auth.uid()) else null end,
    approved_at = case when p_approve then now() else null end
  where id = p_id
  returning * into v_row;

  perform kit.villa_discount_log(v_row, case when p_approve then 'approved' else 'rejected' end);
  return v_row;
end;
$$;

revoke all on function public.review_villa_discount(uuid, boolean) from public, anon;
grant execute on function public.review_villa_discount(uuid, boolean) to authenticated;
