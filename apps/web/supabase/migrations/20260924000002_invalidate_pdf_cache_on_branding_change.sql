-- Cached bill / receipt / advance-voucher PDFs print the association's
-- branding (name, logo, address, GST, PAN, registration, contact, bank
-- details, authorised signatory). Nothing invalidated them when that
-- branding changed, so PDFs rendered before a logo was uploaded kept
-- showing the default mark indefinitely, while freshly rendered documents
-- (reports, statements) showed the real logo.
--
-- Clear the cached paths whenever branding changes, the same way
-- sync_bill_payment_status() clears a bill's cache when a payment changes.
-- The next download re-renders and re-caches. Stored objects are left in
-- place (they are overwritten on the next render).

create or replace function public.invalidate_association_pdf_cache(
  p_association_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
  set pdf_url = null,
      pdf_generated_at = null
  where association_id = p_association_id
    and pdf_url is not null;

  update public.receipts r
  set pdf_url = null
  from public.payments p
  where p.id = r.payment_id
    and p.association_id = p_association_id
    and r.pdf_url is not null;

  update public.advance_application_receipts
  set pdf_url = null
  where association_id = p_association_id
    and pdf_url is not null;
end;
$$;

revoke all on function public.invalidate_association_pdf_cache(uuid)
  from public, anon, authenticated;

-- associations: branding columns printed on documents.
create or replace function public.trg_associations_invalidate_pdf_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.invalidate_association_pdf_cache(new.id);
  return new;
end;
$$;

drop trigger if exists associations_invalidate_pdf_cache on public.associations;
create trigger associations_invalidate_pdf_cache
  after update of address, gstin, gst_enabled, gst_rate, pan_number,
    registration_number, authorised_signatory, email, phone, logo_url,
    bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch
  on public.associations
  for each row
  when (
    (old.address, old.gstin, old.gst_enabled, old.gst_rate, old.pan_number,
     old.registration_number, old.authorised_signatory, old.email, old.phone,
     old.logo_url, old.bank_account_name, old.bank_account_number,
     old.bank_name, old.bank_ifsc, old.bank_branch)
    is distinct from
    (new.address, new.gstin, new.gst_enabled, new.gst_rate, new.pan_number,
     new.registration_number, new.authorised_signatory, new.email, new.phone,
     new.logo_url, new.bank_account_name, new.bank_account_number,
     new.bank_name, new.bank_ifsc, new.bank_branch)
  )
  execute function public.trg_associations_invalidate_pdf_cache();

-- accounts: the association's name and logo (picture_url) live here.
create or replace function public.trg_accounts_invalidate_pdf_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_association_id uuid;
begin
  select id into v_association_id
  from public.associations
  where account_id = new.id;

  if v_association_id is not null then
    perform public.invalidate_association_pdf_cache(v_association_id);
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_invalidate_pdf_cache on public.accounts;
create trigger accounts_invalidate_pdf_cache
  after update of name, picture_url
  on public.accounts
  for each row
  when (
    not new.is_personal_account
    and (old.name, old.picture_url) is distinct from (new.name, new.picture_url)
  )
  execute function public.trg_accounts_invalidate_pdf_cache();

-- One-time reset: PDFs cached before this trigger existed may carry stale
-- branding (e.g. rendered before the logo was uploaded).
update public.bills
set pdf_url = null,
    pdf_generated_at = null
where pdf_url is not null;

update public.receipts
set pdf_url = null
where pdf_url is not null;

update public.advance_application_receipts
set pdf_url = null
where pdf_url is not null;
