-- =============================================================
-- Ooruda Villa — business details for receipts (and later invoices)
--
-- The name and GSTIN printed on receipt vouchers. The address comes from the
-- booking site's properties row. Owner-editable in Villa Settings.
-- =============================================================

alter table public.villa_properties
  add column if not exists legal_name text
    check (legal_name is null or length(btrim(legal_name)) between 2 and 150),
  -- 15 characters: state code, PAN, entity number, Z, check character
  add column if not exists gstin text
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

-- Owners edit them (the existing owner update policy applies).
grant update (legal_name, gstin) on public.villa_properties to authenticated;
