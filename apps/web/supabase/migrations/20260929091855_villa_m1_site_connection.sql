-- =============================================================
-- Ooruda Villa M1 — connection to the villa-booking database
-- (OORUDA_VILLA_PLAN.md §3.4, §5)
--
-- Each villa property in Ooruda points at a property in a villa-booking
-- Supabase project (the guest site's database). Ooruda reaches it with that
-- project's service-role key, which is held in Supabase Vault — never in a
-- table column.
--
-- Security model:
--   * site_project_ref + site_property_id decide WHICH booking data an
--     account can reach. They are set only by connect_villa_property()
--     (service role, i.e. the super-admin action); owners can edit display
--     fields only (column grants).
--   * A site property can be linked to ONE Ooruda villa account, ever: a slug
--     typo on a shared villa-booking project must not cross-wire two villas.
--   * The key is readable only by service_role, through
--     get_villa_site_credentials(), and is deleted with its property.
-- =============================================================

-- ── 1. villa_properties ───────────────────────────────────────
create table if not exists public.villa_properties (
  id                   uuid primary key default extensions.uuid_generate_v4(),
  account_id           uuid not null references public.accounts (id) on delete cascade,
  name                 text not null
                       check (length(trim(name)) between 1 and 120),
  -- which villa-booking Supabase project (its API host)
  site_project_ref     text,
  -- properties.id in that villa-booking database
  site_property_id     uuid,
  -- properties.booking_code_prefix on the site, e.g. 'V19'
  booking_code_prefix  text
                       check (booking_code_prefix ~ '^[A-Z][A-Z0-9]{1,3}$'),
  -- vault.secrets.id holding {"url": ..., "service_key": ...}
  site_credentials_ref uuid,
  status               text not null default 'active'
                       check (status in ('active', 'inactive')),
  is_test              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- one site property ↔ one Ooruda villa property, across all accounts
  unique (site_project_ref, site_property_id)
);

comment on table public.villa_properties is
  'Villa properties of a villa account, each linked to a property in a '
  'villa-booking database. Link and credentials are super-admin only.';

create index if not exists villa_properties_account_id_idx
  on public.villa_properties (account_id);

-- Only villa accounts may own villa data.
create or replace function kit.assert_villa_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.product_type = 'villa'
  ) then
    raise exception 'Villa data can only belong to a villa account'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger villa_properties_assert_villa_account
  before insert or update of account_id on public.villa_properties
  for each row
  execute function kit.assert_villa_account();

create trigger villa_properties_set_timestamps
  before insert or update on public.villa_properties
  for each row
  execute function public.trigger_set_timestamps();

-- A property's key goes with it (including by cascade from its account).
create or replace function kit.delete_villa_site_credentials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.site_credentials_ref is not null then
    delete from vault.secrets where id = old.site_credentials_ref;
  end if;
  return old;
end;
$$;

create trigger villa_properties_delete_credentials
  after delete on public.villa_properties
  for each row
  execute function kit.delete_villa_site_credentials();

alter table public.villa_properties enable row level security;

revoke all on public.villa_properties from anon, authenticated, service_role;
grant select, insert, update, delete on public.villa_properties to service_role;
-- Owners may rename a property or take it offline — nothing else.
grant select on public.villa_properties to authenticated;
grant update (name, status) on public.villa_properties to authenticated;

create policy villa_properties_read on public.villa_properties
  for select to authenticated
  using (
    public.villa_role(account_id) is not null
    or public.is_super_admin()
  );

create policy villa_properties_owner_update on public.villa_properties
  for update to authenticated
  using (public.villa_role(account_id) = 'villa_owner')
  with check (public.villa_role(account_id) = 'villa_owner');

-- ── 2. Connect + credentials (service role only) ──────────────
-- Links (or re-links) a villa account to a site property and stores the key,
-- in ONE transaction. On an existing link only the key and prefix change —
-- the owner's name and status are kept. Returns the villa_properties.id.
create or replace function public.connect_villa_property(
  p_account_id          uuid,
  p_site_url            text,
  p_site_project_ref    text,
  p_site_property_id    uuid,
  p_booking_code_prefix text,
  p_name                text,
  p_service_key         text
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

  if v_id is null then
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

create or replace function public.get_villa_site_credentials(p_property_id uuid)
returns table (url text, service_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (ds.decrypted_secret::jsonb ->> 'url')         as url,
    (ds.decrypted_secret::jsonb ->> 'service_key') as service_key
  from public.villa_properties vp
  join vault.decrypted_secrets ds on ds.id = vp.site_credentials_ref
  where vp.id = p_property_id;
$$;

revoke all on function public.connect_villa_property(uuid, text, text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_villa_site_credentials(uuid)
  from public, anon, authenticated;
grant execute on function public.connect_villa_property(uuid, text, text, uuid, text, text, text)
  to service_role;
grant execute on function public.get_villa_site_credentials(uuid) to service_role;

-- ── 3. Sync log ───────────────────────────────────────────────
-- Every Ooruda write to the villa-booking database leaves a row: what, where,
-- outcome. Written by the server with the service role; owners read their own.
create table if not exists public.villa_sync_log (
  id            uuid primary key default extensions.uuid_generate_v4(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  property_id   uuid references public.villa_properties (id) on delete cascade,
  operation     text not null
                check (operation ~ '^[a-z_]+\.[a-z_]+$'),  -- e.g. 'booking.create'
  site_id       text,            -- id or booking_code on the site
  outcome       text not null check (outcome in ('success', 'error', 'rejected', 'uncertain')),
  error         text,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists villa_sync_log_account_created_idx
  on public.villa_sync_log (account_id, created_at desc);
create index if not exists villa_sync_log_property_id_idx
  on public.villa_sync_log (property_id);
create index if not exists villa_sync_log_actor_user_id_idx
  on public.villa_sync_log (actor_user_id);

create trigger villa_sync_log_assert_villa_account
  before insert on public.villa_sync_log
  for each row
  execute function kit.assert_villa_account();

alter table public.villa_sync_log enable row level security;

revoke all on public.villa_sync_log from anon, authenticated, service_role;
grant select, insert on public.villa_sync_log to service_role;
grant select on public.villa_sync_log to authenticated;

create policy villa_sync_log_owner_read on public.villa_sync_log
  for select to authenticated
  using (
    public.villa_role(account_id) = 'villa_owner'
    or public.is_super_admin()
  );
