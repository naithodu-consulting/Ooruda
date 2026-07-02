-- Add registration_number to associations.
-- Associations (e.g. housing societies, commercial complexes) often have a
-- government-issued registration number separate from their GSTIN.

alter table public.associations
  add column if not exists registration_number varchar(100) default null;

comment on column public.associations.registration_number is
  'Official registration number issued by the Registrar of Societies or equivalent authority.';
