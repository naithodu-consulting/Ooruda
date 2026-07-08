-- Billing entity fields
-- Captures whether the billed party (owner or tenant) is an individual or a company,
-- and stores the company's details for use on PDF invoices.

-- tenancies: company billing info when the tenant is a company
alter table public.tenancies
  add column if not exists is_company       boolean not null default false,
  add column if not exists company_name     text,
  add column if not exists company_address  text,
  add column if not exists company_gstin    text;

-- units: bill_to preference + owner company billing info
alter table public.units
  add column if not exists bill_to              text not null default 'auto'
    check (bill_to in ('auto', 'owner', 'tenant')),
  add column if not exists owner_is_company     boolean not null default false,
  add column if not exists owner_company_name   text,
  add column if not exists owner_company_address text,
  add column if not exists owner_company_gstin  text;

-- associations: PAN number (shown on bills when GSTIN is absent)
alter table public.associations
  add column if not exists pan_number text;
