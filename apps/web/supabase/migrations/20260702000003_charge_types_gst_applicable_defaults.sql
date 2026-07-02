-- =============================================================
-- Fix gst_applicable defaults for built-in charge types.
--
-- All charge types were seeded with gst_applicable = false.
-- In Indian apartment associations:
--   - Maintenance charges: GST-applicable (registered societies above threshold)
--   - Other charges: GST-applicable (ad-hoc charges same treatment as maintenance)
--   - Electricity: NOT GST-applicable (pass-through to BESCOM/MESCOM)
--
-- This migration updates existing associations' charge types and fixes
-- the seed trigger so new associations get the correct defaults.
-- =============================================================

-- Update existing maintenance and other_charges to gst_applicable = true.
-- electricity stays false (pass-through billing).
update public.charge_types
set gst_applicable = true
where key in ('maintenance', 'other_charges');

-- Fix the seed trigger so newly created associations also get correct defaults.
create or replace function public.seed_association_charge_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.charge_types
    (association_id, key, name, is_builtin, calc_method, frequency, default_payer, gst_applicable)
  values
    (new.id, 'maintenance',   'Maintenance',   true, 'per_sqft',    'Monthly', 'Owner',  true),
    (new.id, 'electricity',   'Electricity',   true, 'electricity', 'Monthly', 'Tenant', false),
    (new.id, 'other_charges', 'Other Charges', true, 'flat',        'OneTime', 'Owner',  true);
  return new;
end;
$$;
