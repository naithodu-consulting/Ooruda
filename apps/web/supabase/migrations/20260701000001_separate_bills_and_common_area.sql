-- Add new unit type
alter table public.units drop constraint if exists units_type_check;
alter table public.units add constraint units_type_check check (type in ('Shop','Office','Warehouse','Common Area'));

-- Update billing_settings to support 3 distinct due days and prefix
alter table public.billing_settings
  add column electricity_due_day smallint not null default 10 check (electricity_due_day between 1 and 28),
  add column maintenance_due_day smallint not null default 10 check (maintenance_due_day between 1 and 28),
  add column other_charges_due_day smallint not null default 10 check (other_charges_due_day between 1 and 28);

-- Drop unique constraint on bills so a unit can receive multiple bills for the same period
alter table public.bills drop constraint if exists bills_association_id_unit_id_period_key;
