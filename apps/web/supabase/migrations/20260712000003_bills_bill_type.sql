-- =============================================================
-- Add bill_type column to bills for indexed filtering.
--
-- Previously bill type was derived at query time via ILIKE on
-- bill_no (e.g. '%-ELEC-%'), which requires a full table scan.
-- A stored bill_type column allows composite index lookups and
-- lets the client filter entirely in-memory without any SQL.
-- =============================================================

alter table public.bills
  add column if not exists bill_type varchar(20);

-- Backfill from existing bill_no patterns.
update public.bills
   set bill_type = case
     when bill_no ilike '%-ELEC-%' then 'electricity'
     when bill_no ilike '%-MANT-%' then 'maintenance'
     when bill_no ilike '%-OTHR-%' then 'other_charges'
     else 'maintenance'
   end
 where bill_type is null;

-- Make non-nullable now that all rows are populated.
alter table public.bills
  alter column bill_type set not null,
  alter column bill_type set default 'maintenance';

-- Composite indexes for the two common access patterns:
--   1. Admin/billing_operator sees all bills for an association.
--   2. prop_owner/tenant sees bills for specific unit(s).
create index if not exists bills_assoc_type_period_status
  on public.bills (association_id, bill_type, period, status);

create index if not exists bills_unit_type_period_status
  on public.bills (unit_id, bill_type, period, status);
