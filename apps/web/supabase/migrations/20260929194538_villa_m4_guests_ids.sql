-- =============================================================
-- Ooruda Villa M4 — guests and identity documents
-- (OORUDA_VILLA_PLAN.md §5, §7)
--
--   villa_guests                 guest register per villa account; phone in
--                                E.164, one guest per phone (repeat guests)
--   villa_booking_guests         who stayed on which booking
--   villa_guest_documents        ID documents: type, MASKED number, where the
--                                file is (private bucket), who captured and
--                                verified it, when it is purged
--   villa_guest_document_access  append-only record of every upload, view,
--                                verification, deletion and purge
--   storage bucket villa-guest-docs  private; no member access at the storage
--                                layer at all. Files move only through the
--                                server, which authorises, records the access,
--                                and hands out 60-second signed links.
--
-- Guest identity documents are the most sensitive data in Ooruda. Full ID
-- numbers are never stored: the server masks them before insert.
-- =============================================================

-- ── 1. Guests ─────────────────────────────────────────────────
create table if not exists public.villa_guests (
  id          uuid primary key default extensions.uuid_generate_v4(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  -- E.164 (+91XXXXXXXXXX), set by the server via normalizePhoneNumber
  phone       text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  email       text check (email is null or length(email) <= 200),
  notes       text check (notes is null or length(notes) <= 1000),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists villa_guests_account_phone_key
  on public.villa_guests (account_id, phone) where phone is not null;
create index if not exists villa_guests_created_by_idx
  on public.villa_guests (created_by);

create trigger villa_guests_scope
  before insert or update of account_id on public.villa_guests
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_guests_updated_at
  before update on public.villa_guests
  for each row execute function public.trigger_set_timestamps();

alter table public.villa_guests enable row level security;
revoke all on public.villa_guests from anon, authenticated, service_role;
-- Members read; the server writes (after checking the role and the booking),
-- so the register cannot be edited around the app's rules.
grant select on public.villa_guests to authenticated;
grant select, insert, update, delete on public.villa_guests to service_role;

create policy villa_guests_read on public.villa_guests
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 2. Guests on a booking ────────────────────────────────────
create table if not exists public.villa_booking_guests (
  id              uuid primary key default extensions.uuid_generate_v4(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  property_id     uuid not null references public.villa_properties (id) on delete cascade,
  site_booking_id uuid not null,
  guest_id        uuid not null references public.villa_guests (id) on delete cascade,
  is_primary      boolean not null default false,
  is_adult        boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (property_id, site_booking_id, guest_id)
);

create unique index if not exists villa_booking_guests_one_primary
  on public.villa_booking_guests (property_id, site_booking_id) where is_primary;
create index if not exists villa_booking_guests_guest_idx
  on public.villa_booking_guests (guest_id);
create index if not exists villa_booking_guests_account_idx
  on public.villa_booking_guests (account_id);

create trigger villa_booking_guests_scope
  before insert or update of account_id, property_id on public.villa_booking_guests
  for each row execute function kit.assert_villa_row_scope();

-- A guest of another villa account cannot be put on this villa's booking.
create or replace function kit.assert_villa_guest_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.villa_guests g
    where g.id = new.guest_id and g.account_id = new.account_id
  ) then
    raise exception 'That guest belongs to another account'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger villa_booking_guests_guest_scope
  before insert or update of guest_id, account_id on public.villa_booking_guests
  for each row execute function kit.assert_villa_guest_scope();

alter table public.villa_booking_guests enable row level security;
revoke all on public.villa_booking_guests from anon, authenticated, service_role;
grant select on public.villa_booking_guests to authenticated;
grant select, insert, update, delete on public.villa_booking_guests to service_role;

create policy villa_booking_guests_read on public.villa_booking_guests
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 3. Identity documents ─────────────────────────────────────
create table if not exists public.villa_guest_documents (
  id              uuid primary key default extensions.uuid_generate_v4(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  property_id     uuid not null references public.villa_properties (id) on delete cascade,
  site_booking_id uuid not null,
  -- no action (checked at statement end, unlike restrict): deleting a guest
  -- with documents is refused, so a file is never orphaned by a guest delete,
  -- while deleting a whole villa account still cascades cleanly.
  guest_id        uuid not null references public.villa_guests (id) on delete no action,
  doc_type        text not null check (doc_type in ('aadhaar', 'passport', 'driving_licence', 'voter_id', 'other')),
  -- e.g. 'XXXX XXXX 1234'. Never the full number.
  masked_number   text check (masked_number is null or (length(masked_number) <= 32 and masked_number !~ '[0-9]{5,}')),
  -- soft_copy: a file is stored; seen_in_person: checked at the villa, no file
  stage           text not null check (stage in ('soft_copy', 'seen_in_person')),
  -- {account_id}/{property_id}/{site_booking_id}/{document_id}
  storage_path    text check (storage_path is null or length(storage_path) <= 300),
  content_type    text check (content_type is null or content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  captured_by     uuid references auth.users (id) on delete set null,
  captured_at     timestamptz not null default now(),
  verified_by     uuid references auth.users (id) on delete set null,
  verified_at     timestamptz,
  -- check-out + retention_days; the purge deletes the file on or after this
  purge_after     date not null,
  purged_at       timestamptz,
  constraint villa_guest_documents_file check (
    (stage = 'soft_copy' and (storage_path is not null or purged_at is not null))
    or (stage = 'seen_in_person' and storage_path is null)
  )
);

create index if not exists villa_guest_documents_booking_idx
  on public.villa_guest_documents (property_id, site_booking_id);
create index if not exists villa_guest_documents_guest_idx
  on public.villa_guest_documents (guest_id);
create index if not exists villa_guest_documents_account_idx
  on public.villa_guest_documents (account_id);
create index if not exists villa_guest_documents_purge_idx
  on public.villa_guest_documents (purge_after) where purged_at is null and storage_path is not null;
create index if not exists villa_guest_documents_captured_by_idx
  on public.villa_guest_documents (captured_by);
create index if not exists villa_guest_documents_verified_by_idx
  on public.villa_guest_documents (verified_by);

create trigger villa_guest_documents_scope
  before insert or update of account_id, property_id on public.villa_guest_documents
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_guest_documents_guest_scope
  before insert or update of guest_id, account_id on public.villa_guest_documents
  for each row execute function kit.assert_villa_guest_scope();

alter table public.villa_guest_documents enable row level security;
revoke all on public.villa_guest_documents from anon, authenticated, service_role;
-- Members see the list (type, masked number, stage); the server writes.
grant select on public.villa_guest_documents to authenticated;
grant select, insert, update, delete on public.villa_guest_documents to service_role;

create policy villa_guest_documents_read on public.villa_guest_documents
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 4. Access record ──────────────────────────────────────────
create table if not exists public.villa_guest_document_access (
  id            uuid primary key default extensions.uuid_generate_v4(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  document_id   uuid not null references public.villa_guest_documents (id) on delete cascade,
  action        text not null check (action in ('uploaded', 'recorded', 'viewed', 'verified', 'deleted', 'purged')),
  -- null for the automatic purge
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists villa_guest_document_access_doc_idx
  on public.villa_guest_document_access (document_id, created_at);
create index if not exists villa_guest_document_access_account_idx
  on public.villa_guest_document_access (account_id, created_at desc);
create index if not exists villa_guest_document_access_actor_idx
  on public.villa_guest_document_access (actor_user_id);

create trigger villa_guest_document_access_scope
  before insert or update of account_id on public.villa_guest_document_access
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_guest_document_access enable row level security;
revoke all on public.villa_guest_document_access from anon, authenticated, service_role;
grant select on public.villa_guest_document_access to authenticated;
-- Append-only, server-written.
grant select, insert on public.villa_guest_document_access to service_role;

-- Who looked at guest IDs is the owner's (and Ooruda's) to see.
create policy villa_guest_document_access_read on public.villa_guest_document_access
  for select to authenticated
  using (public.villa_role(account_id) = 'villa_owner' or public.is_super_admin());

-- ── 5. Storage ────────────────────────────────────────────────
-- Private, 10 MB, images and PDF only. No storage.objects policy is created
-- for this bucket: authenticated users get nothing at the storage layer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'villa-guest-docs', 'villa-guest-docs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- ── 6. The villa's WhatsApp business number ───────────────────
-- Where guests send their IDs (the booking site keeps it in its env today;
-- villa-booking TODO asks for a properties column). E.164.
alter table public.villa_properties
  add column if not exists whatsapp_number text
    check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{6,14}$');

-- Owners edit it in Villa Settings (the existing owner update policy applies).
grant update (whatsapp_number) on public.villa_properties to authenticated;

-- ── 7. Never orphan an ID file ────────────────────────────────
-- Deleting a villa property (or its account) would drop the document rows
-- the purge uses to find files, leaving scans in storage for good. Refuse
-- while any stored file remains; delete or purge the IDs first.
create or replace function kit.villa_property_ids_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.villa_guest_documents d
    where d.property_id = old.id
      and d.storage_path is not null
      and d.purged_at is null
  ) then
    raise exception 'This villa still holds guest ID photos. Delete them before removing the villa.'
      using errcode = 'foreign_key_violation';
  end if;

  return old;
end;
$$;

create trigger villa_properties_ids_guard
  before delete on public.villa_properties
  for each row execute function kit.villa_property_ids_guard();
