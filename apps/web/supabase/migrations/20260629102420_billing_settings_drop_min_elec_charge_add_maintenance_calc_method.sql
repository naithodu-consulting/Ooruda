-- Remove minimum_electricity_charge — now tracked per billing period in
-- meter_readings.minimum_charge instead.
alter table billing_settings
  drop column if exists minimum_electricity_charge;

-- Allow calc_method on charge_types to be updated (needed for the
-- maintenance per_sqft ↔ per_unit toggle in settings).
-- The existing check constraint already allows 'per_unit', so no DDL needed
-- for charge_types — this migration only handles billing_settings.
