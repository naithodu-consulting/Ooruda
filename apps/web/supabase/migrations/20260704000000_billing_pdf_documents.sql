-- =============================================================
-- PDF Bills & Receipts
--
-- Adds GST rate configuration (association-level, split evenly into
-- CGST/SGST on the PDF), caches generated bill PDFs via bills.pdf_url,
-- and creates a private storage bucket for the generated documents.
-- receipts.pdf_url already exists (20260612000000_ooruda_domain.sql)
-- and is reused the same way.
-- =============================================================

alter table public.associations
  add column if not exists gst_rate numeric(5, 2);

alter table public.bills
  add column if not exists pdf_url text,
  add column if not exists pdf_generated_at timestamptz;

-- ─── STORAGE BUCKET ───────────────────────────────────────────
-- Private bucket. Objects are written only by the server (route handler
-- using the admin/service-role client) after an RLS-backed read confirms
-- the caller can see the underlying bill/payment. Reads are also locked
-- down at the storage layer as defense-in-depth, scoped by the
-- association_id segment of the object path:
--   bills/{association_id}/{bill_id}.pdf
--   receipts/{association_id}/{payment_id}.pdf
insert into storage.buckets (id, name, public)
values ('billing-documents', 'billing-documents', false)
on conflict (id) do nothing;

create or replace function kit.get_association_id_from_billing_path(name text)
returns uuid
set search_path = ''
as $$
  select (storage.foldername(name))[2]::uuid;
$$ language sql immutable;

grant execute on function kit.get_association_id_from_billing_path(text)
  to authenticated, service_role;

-- Members can read documents for their own association; only service_role
-- (the admin client used by the PDF route handlers) can write.
create policy "billing_documents_member_read" on storage.objects
  for select
  using (
    bucket_id = 'billing-documents'
    and public.association_role(
      kit.get_association_id_from_billing_path(name)
    ) is not null
  );

create policy "billing_documents_service_write" on storage.objects
  for insert
  to service_role
  with check (bucket_id = 'billing-documents');

create policy "billing_documents_service_update" on storage.objects
  for update
  to service_role
  using (bucket_id = 'billing-documents');
