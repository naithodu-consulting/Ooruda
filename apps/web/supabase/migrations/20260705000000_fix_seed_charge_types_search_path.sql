-- 20260702000000_other_charges.sql redefined seed_builtin_charge_types()
-- with an unqualified `insert into charge_types`. That resolves fine under
-- the app's normal connection (search_path includes public), but fails
-- under the pgTAP test harness's restricted search_path with
-- "relation charge_types does not exist" — breaking every test that calls
-- create_team_account() (which fires this trigger). Fully qualify the
-- table name, matching the public.associations qualification already used
-- two lines below it in the same function.
create or replace function public.seed_builtin_charge_types()
returns trigger language plpgsql as $$
begin
  insert into public.charge_types
    (association_id, key,             name,             is_builtin, calc_method,   frequency,  default_payer, gst_applicable)
  values
    (new.id, 'maintenance',   'Maintenance',   true, 'per_sqft',    'Monthly',  'Owner',  false),
    (new.id, 'electricity',   'Electricity',   true, 'electricity', 'Monthly',  'Owner',  false),
    (new.id, 'water',         'Water',         true, 'flat',        'Monthly',  'Owner',  false),
    (new.id, 'other_charges', 'Other Charges', true, 'flat',        'OneTime',  'Tenant', false);
  return new;
end;
$$;
