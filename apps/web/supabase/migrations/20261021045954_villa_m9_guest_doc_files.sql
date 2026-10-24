-- =============================================================
-- Ooruda Villa M9 — multi-file guest ID documents
-- (OORUDA_KNOWLEDGE.md §villa-m9)
--
-- Changes:
--   1. villa_guest_document_files  New child table: N files per ID document.
--                                  Existing single-file rows are migrated.
--   2. villa_guest_documents       Drop storage_path, content_type (now on
--                                  files table). Keep purge_after for the
--                                  booking-cancel shortcut; keep purged_at as
--                                  a tombstone cache set when all files purge.
--   3. villa_guest_document_access Add 'downloaded' action value.
-- =============================================================

-- ── 1. Extend the access-log action check ─────────────────────
alter table public.villa_guest_document_access
  drop constraint if exists villa_guest_document_access_action_check;

alter table public.villa_guest_document_access
  add constraint villa_guest_document_access_action_check
  check (action in ('uploaded', 'recorded', 'viewed', 'downloaded', 'verified', 'deleted', 'purged'));

-- ── 2. Files table ────────────────────────────────────────────
create table if not exists public.villa_guest_document_files (
  id           uuid primary key default extensions.uuid_generate_v4(),
  document_id  uuid not null
                 references public.villa_guest_documents (id) on delete cascade,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  -- 1 = first/only, 2 = second (e.g. back of card)
  file_order   int not null default 1 check (file_order between 1 and 10),
  -- Optional user-facing label: 'front' | 'back' | null
  label        text check (label is null or label in ('front', 'back')),
  -- {account_id}/{property_id}/{site_booking_id}/{document_id}/{file_id}
  storage_path text not null check (length(storage_path) <= 350),
  content_type text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  purge_after  date not null,
  purged_at    timestamptz,
  captured_by  uuid references auth.users (id) on delete set null,
  captured_at  timestamptz not null default now()
);

create index if not exists villa_guest_document_files_doc_idx
  on public.villa_guest_document_files (document_id);
create index if not exists villa_guest_document_files_account_idx
  on public.villa_guest_document_files (account_id);
create index if not exists villa_guest_document_files_purge_idx
  on public.villa_guest_document_files (purge_after)
  where purged_at is null;

create trigger villa_guest_document_files_scope
  before insert or update of account_id on public.villa_guest_document_files
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_guest_document_files enable row level security;
revoke all on public.villa_guest_document_files from anon, authenticated, service_role;
grant select on public.villa_guest_document_files to authenticated;
grant select, insert, update, delete on public.villa_guest_document_files to service_role;

create policy villa_guest_document_files_read on public.villa_guest_document_files
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 3. Migrate existing single-file rows ──────────────────────
-- Every document with a storage_path gets one file row (file_order = 1).
-- purged_at is carried over so already-purged files stay tombstoned.
insert into public.villa_guest_document_files (
  id, document_id, account_id, file_order, label,
  storage_path, content_type, purge_after, purged_at,
  captured_by, captured_at
)
select
  extensions.uuid_generate_v4(),
  d.id,
  d.account_id,
  1,
  null,
  d.storage_path,
  -- villa_guest_documents.content_type is nullable, but it is NOT NULL here.
  -- Rather than assume a type, read the real one the storage object recorded
  -- at upload; only the four types this table allows are accepted from there,
  -- so an unexpected value cannot break the check constraint. 'image/jpeg' is
  -- the last resort, and reached only for a row whose object is already gone
  -- (purged), where the type no longer matters.
  coalesce(
    d.content_type,
    (
      case
        when o.metadata ->> 'mimetype' in
          ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
        then o.metadata ->> 'mimetype'
      end
    ),
    'image/jpeg'
  ),
  d.purge_after,
  d.purged_at,
  d.captured_by,
  d.captured_at
from public.villa_guest_documents d
left join storage.objects o
  on o.bucket_id = 'villa-guest-docs'
 and o.name = d.storage_path
where d.storage_path is not null;

-- ── 3b. Refuse to drop the source columns unless the copy is whole ──
-- The insert above and the drops below are one transaction, so failing here
-- rolls the whole migration back and storage_path survives untouched.
do $$
declare
  v_source  int;
  v_copied  int;
  v_guessed int;
begin
  select count(*) into v_source
  from public.villa_guest_documents
  where storage_path is not null;

  select count(*) into v_copied
  from public.villa_guest_document_files f
  join public.villa_guest_documents d on d.id = f.document_id
  where d.storage_path is not null;

  if v_copied <> v_source then
    raise exception
      'villa m9: copied % file row(s) for % document(s) with a file; refusing to drop storage_path',
      v_copied, v_source;
  end if;

  -- Live rows that still fell back to the default: their stored type was
  -- null AND storage had no usable mimetype. Worth knowing about, but not
  -- worth failing a deploy over - the bytes are intact either way.
  select count(*) into v_guessed
  from public.villa_guest_documents d
  left join storage.objects o
    on o.bucket_id = 'villa-guest-docs'
   and o.name = d.storage_path
  where d.storage_path is not null
    and d.purged_at is null
    and d.content_type is null
    and coalesce(o.metadata ->> 'mimetype', '') not in
      ('image/jpeg', 'image/png', 'image/webp', 'application/pdf');

  if v_guessed > 0 then
    raise warning
      'villa m9: % live file(s) had no recorded type and were stored as image/jpeg; check they open correctly',
      v_guessed;
  end if;

  raise notice 'villa m9: copied % file row(s) from % document(s)', v_copied, v_source;
end $$;

-- ── 4. Clean up villa_guest_documents ─────────────────────────
-- Drop the file-specific constraint (now enforced by the files table).
alter table public.villa_guest_documents
  drop constraint if exists villa_guest_documents_file;

-- Drop file columns (data is now in villa_guest_document_files).
-- purge_after stays: the booking-cancel shortcut still needs it.
-- purged_at stays: used as a tombstone cache + display ("Photo deleted on X").
alter table public.villa_guest_documents
  drop column if exists storage_path;

alter table public.villa_guest_documents
  drop column if exists content_type;

-- Refresh the purge index: it no longer needs storage_path.
drop index if exists public.villa_guest_documents_purge_idx;
create index if not exists villa_guest_documents_purge_idx
  on public.villa_guest_documents (purge_after) where purged_at is null;
