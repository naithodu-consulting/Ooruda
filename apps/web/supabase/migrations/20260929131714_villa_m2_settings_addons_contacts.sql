-- =============================================================
-- Ooruda Villa M2 — villa settings, add-ons, emergency contacts
-- (OORUDA_VILLA_PLAN.md §5, §6)
--
-- Ooruda-side data only. Rates, occupancy and check-in/out times live on the
-- villa-booking database and are edited there through lib/villa-db.
--
--   villa_account_settings   per villa account (managers_can_cancel)
--   villa_properties         + ota_buffer_nights (owner), retention_days
--                              (legal policy: super-admin only, default 30)
--   villa_addons             extra bed, breakfast, … (Ooruda catalogue; the
--                              guest site does not sell add-ons yet)
--   villa_emergency_contacts per property, shown to staff and in
--                              pre-arrival emails
-- =============================================================

-- ── 1. Shared guard: rows belong to a villa account and, when they name a
--      property, to a property of THAT account ─────────────────
create or replace function kit.assert_villa_row_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id uuid := (to_jsonb(new) ->> 'property_id')::uuid;
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.product_type = 'villa'
  ) then
    raise exception 'Villa data can only belong to a villa account'
      using errcode = 'check_violation';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.villa_properties vp
    where vp.id = v_property_id and vp.account_id = new.account_id
  ) then
    raise exception 'That villa property belongs to another account'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ── 2. villa_properties: operational settings ─────────────────
alter table public.villa_properties
  add column if not exists ota_buffer_nights smallint not null default 0
    check (ota_buffer_nights between 0 and 14),
  add column if not exists retention_days smallint not null default 30
    check (retention_days between 1 and 3650);

comment on column public.villa_properties.retention_days is
  'Days after check-out that guest identity documents are kept. Legal '
  'policy (decided 30 days, 2026-09-27); super-admin only.';

-- Owners may also set the OTA buffer. retention_days stays service-role only.
grant update (ota_buffer_nights) on public.villa_properties to authenticated;

-- A super-admin acts as the villa owner in the app, so the owner update policy
-- (M1) must admit them too — otherwise their edits are silently dropped.
drop policy if exists villa_properties_owner_update on public.villa_properties;
create policy villa_properties_owner_update on public.villa_properties
  for update to authenticated
  using (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin())
  with check (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin());

-- ── 3. villa_account_settings ─────────────────────────────────
create table if not exists public.villa_account_settings (
  account_id          uuid primary key references public.accounts (id) on delete cascade,
  managers_can_cancel boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null
);

comment on column public.villa_account_settings.managers_can_cancel is
  'When true, villa managers may cancel bookings and issue policy refunds. '
  'Overriding a refund amount stays owner-only regardless.';

create index if not exists villa_account_settings_updated_by_idx
  on public.villa_account_settings (updated_by);

create trigger villa_account_settings_scope
  before insert or update of account_id on public.villa_account_settings
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_account_settings_set_timestamps
  before insert or update on public.villa_account_settings
  for each row execute function public.trigger_set_timestamps();

-- ── 4. villa_addons ───────────────────────────────────────────
create table if not exists public.villa_addons (
  id            uuid primary key default extensions.uuid_generate_v4(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  property_id   uuid not null references public.villa_properties (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  description   text check (description is null or length(description) <= 500),
  price         numeric(12, 2) not null check (price >= 0),
  pricing_unit  text not null
                check (pricing_unit in ('per_stay', 'per_night', 'per_guest_per_night', 'per_unit')),
  is_active     boolean not null default true,
  display_order smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- "Extra bed" and "extra bed" are the same add-on.
create unique index if not exists villa_addons_property_name_key
  on public.villa_addons (property_id, lower(name));

create index if not exists villa_addons_account_id_idx on public.villa_addons (account_id);

create trigger villa_addons_scope
  before insert or update of account_id, property_id on public.villa_addons
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_addons_set_timestamps
  before insert or update on public.villa_addons
  for each row execute function public.trigger_set_timestamps();

-- ── 5. villa_emergency_contacts ───────────────────────────────
create table if not exists public.villa_emergency_contacts (
  id            uuid primary key default extensions.uuid_generate_v4(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  property_id   uuid not null references public.villa_properties (id) on delete cascade,
  category      text not null check (category in (
                  'owner', 'manager', 'caretaker', 'security', 'doctor', 'hospital',
                  'police', 'fire', 'ambulance', 'electrician', 'plumber', 'other')),
  name          text not null check (length(trim(name)) between 1 and 120),
  -- E.164, e.g. +919876543210 (app standard for every phone number)
  phone         text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  notes         text check (notes is null or length(notes) <= 300),
  share_with_guests boolean not null default false,
  display_order smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.villa_emergency_contacts.share_with_guests is
  'Included in the guest pre-arrival email when true. Staff always see all.';

create index if not exists villa_emergency_contacts_account_id_idx
  on public.villa_emergency_contacts (account_id);
create index if not exists villa_emergency_contacts_property_id_idx
  on public.villa_emergency_contacts (property_id);

create trigger villa_emergency_contacts_scope
  before insert or update of account_id, property_id on public.villa_emergency_contacts
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_emergency_contacts_set_timestamps
  before insert or update on public.villa_emergency_contacts
  for each row execute function public.trigger_set_timestamps();

-- ── 6. Grants + RLS: members read, owners write ───────────────
do $$
declare
  t text;
begin
  foreach t in array array['villa_account_settings', 'villa_addons', 'villa_emergency_contacts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);

    execute format($p$
      create policy %I on public.%I for select to authenticated
      using (public.villa_role(account_id) is not null or public.is_super_admin())
    $p$, t || '_read', t);

    execute format($p$
      create policy %I on public.%I for insert to authenticated
      with check (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin())
    $p$, t || '_owner_insert', t);

    execute format($p$
      create policy %I on public.%I for update to authenticated
      using (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin())
      with check (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin())
    $p$, t || '_owner_update', t);

    execute format($p$
      create policy %I on public.%I for delete to authenticated
      using (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin())
    $p$, t || '_owner_delete', t);
  end loop;
end;
$$;
