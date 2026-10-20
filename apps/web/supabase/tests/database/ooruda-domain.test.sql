-- =============================================================
-- Ooruda domain - schema, triggers, constraints, generated cols
-- -------------------------------------------------------------
-- Validates the database-enforced business rules from
-- 20260612000000_ooruda_domain.sql and 20260614000003_assoc_setup.sql:
--   * auto-provisioning triggers (association on team create; builtin
--     charge types + billing_settings on association create; profile on
--     user signup)
--   * CHECK / enum constraints (calc_method, frequency, status, payer,
--     unit type, due-day range)
--   * uniqueness rules (one charge-type key per association, one active
--     tenancy per unit, one bill per unit-period)
--   * STORED generated columns (meter consumed_units, reconciliation delta)
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

-- ── Setup: two associations to exercise per-tenant behaviour ──
select tests.create_supabase_user('admin_a');
select tests.create_supabase_user('admin_b');

set local role service_role;

select public.create_team_account('Assoc A', tests.get_supabase_uid('admin_a'), 'assoc-a');
select public.create_team_account('Assoc B', tests.get_supabase_uid('admin_b'), 'assoc-b');

set local role postgres;

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: team account create → associations row auto-created
-- ─────────────────────────────────────────────────────────────
select isnt_empty(
  $$ select 1 from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  'creating a team account auto-creates its associations row'
);

select row_eq(
  $$ select status from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  row('Setup'::text),
  'a new association defaults to Setup status'
);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: association create → 3 builtin charge types seeded
-- ─────────────────────────────────────────────────────────────
select results_eq(
  $$ select key, calc_method from public.charge_types
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a'))
       and is_builtin
     order by key $$,
  $$ values ('electricity'::text, 'electricity'::text),
            ('maintenance'::text, 'per_sqft'::text),
            ('penalty'::text,     'flat'::text) $$,
  'a new association is seeded with maintenance/electricity/penalty builtin charge types'
);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: association create → billing_settings row with defaults
-- ─────────────────────────────────────────────────────────────
select row_eq(
  $$ select due_day_of_month from public.billing_settings
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a')) $$,
  row(10::smallint),
  'billing_settings is auto-created with the default 10th-of-month due day'
);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: auth.users insert → public.profiles row created
-- ─────────────────────────────────────────────────────────────
select isnt_empty(
  $$ select 1 from public.profiles where id = tests.get_supabase_uid('admin_a') $$,
  'a profile row is created automatically for every new auth user'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: charge_types.calc_method is restricted to the enum
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.charge_types
       (association_id, key, name, calc_method, frequency)
     select id, 'bogus', 'Bogus', 'fortnightly', 'Monthly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '23514'::text,
  null::text,
  'an unsupported calc_method is rejected by the CHECK constraint'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: charge_types.frequency is restricted to the enum
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.charge_types
       (association_id, key, name, calc_method, frequency)
     select id, 'wk', 'Weekly', 'flat', 'Weekly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '23514'::text,
  null::text,
  'an unsupported frequency is rejected'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: one charge-type key per association (unique)
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.charge_types
       (association_id, key, name, calc_method, frequency)
     select id, 'maintenance', 'Dup Maintenance', 'per_sqft', 'Monthly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '23505'::text,
  null::text,
  'a duplicate charge-type key within one association is rejected'
);

-- A valid custom charge type with the SAME key in a DIFFERENT association is OK.
select lives_ok(
  $$ insert into public.charge_types
       (association_id, key, name, calc_method, rate_or_amount, frequency)
     select id, 'maintenance_extra', 'Extra', 'per_sqft', 2.50, 'Monthly'
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-b') $$,
  'a custom charge type with a new key is accepted'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: association status enum
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.associations set status = 'Archived'
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '23514'::text,
  null::text,
  'an out-of-enum association status is rejected'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: billing_settings.due_day_of_month must be 1..28
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.billing_settings set due_day_of_month = 31
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a')) $$,
  '23514'::text,
  null::text,
  'a due day past the 28th is rejected (avoids missing-day months)'
);

select lives_ok(
  $$ update public.billing_settings set due_day_of_month = 28
     where association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a')) $$,
  'the 28th is an accepted due day'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: units.type and units.status enums
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.units (association_id, unit_no, type, area_sqft)
     select id, 'BAD-1', 'Penthouse', 100
     from public.associations
     where account_id = makerkit.get_account_id_by_slug('assoc-a') $$,
  '23514'::text,
  null::text,
  'an unsupported unit type is rejected'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: one active tenancy per unit (partial unique index)
-- ─────────────────────────────────────────────────────────────
-- Build a unit + two tenants in assoc-a.
insert into public.units (association_id, unit_no, type, area_sqft, status)
select id, 'U-100', 'Shop', 450, 'Occupied'
from public.associations
where account_id = makerkit.get_account_id_by_slug('assoc-a');

select tests.create_supabase_user('tenant_x');
select tests.create_supabase_user('tenant_y');

insert into public.tenancies (unit_id, tenant_id, start_date)
select u.id, tests.get_supabase_uid('tenant_x'), '2026-01-01'
from public.units u
join public.associations a on a.id = u.association_id
where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100';

select throws_ok(
  $$ insert into public.tenancies (unit_id, tenant_id, start_date)
     select u.id, tests.get_supabase_uid('tenant_y'), '2026-02-01'
     from public.units u
     join public.associations a on a.id = u.association_id
     where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100' $$,
  '23505'::text,
  null::text,
  'a second active tenancy on the same unit is rejected'
);

-- Ending the first tenancy frees the unit for a new active tenancy.
update public.tenancies set end_date = '2026-01-31', status = 'ended'
where tenant_id = tests.get_supabase_uid('tenant_x');

select lives_ok(
  $$ insert into public.tenancies (unit_id, tenant_id, start_date)
     select u.id, tests.get_supabase_uid('tenant_y'), '2026-02-01'
     from public.units u
     join public.associations a on a.id = u.association_id
     where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100' $$,
  'a new active tenancy is accepted once the prior one has ended'
);

-- ─────────────────────────────────────────────────────────────
-- GENERATED COLUMN: meter_readings.consumed_units = current - previous
-- ─────────────────────────────────────────────────────────────
insert into public.sub_meters (unit_id, meter_label)
select u.id, 'SM-1'
from public.units u
join public.associations a on a.id = u.association_id
where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100';

insert into public.mescom_bills (association_id, period, invoice_amount, block_consumption_units)
select id, '2026-06', 10000.00, 1500.00
from public.associations
where account_id = makerkit.get_account_id_by_slug('assoc-a');

insert into public.meter_readings
  (sub_meter_id, mescom_bill_id, period, previous_reading, current_reading)
select sm.id, mb.id, '2026-06', 100.00, 250.00
from public.sub_meters sm
join public.units u on u.id = sm.unit_id
join public.associations a on a.id = u.association_id
join public.mescom_bills mb on mb.association_id = a.id and mb.period = '2026-06'
where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and sm.meter_label = 'SM-1';

select results_eq(
  $$ select mr.consumed_units
     from public.meter_readings mr
     join public.sub_meters sm on sm.id = mr.sub_meter_id
     where sm.meter_label = 'SM-1' and mr.period = '2026-06' $$,
  $$ values (150.00::numeric) $$,
  'consumed_units is computed as current_reading minus previous_reading'
);

-- ─────────────────────────────────────────────────────────────
-- GENERATED COLUMN: electricity_reconciliation.delta = recovered - invoiced
-- ─────────────────────────────────────────────────────────────
insert into public.electricity_reconciliation
  (association_id, mescom_bill_id, period, invoiced_amount, recovered_amount)
select a.id, mb.id, '2026-06', 10000.00, 8000.00
from public.associations a
join public.mescom_bills mb on mb.association_id = a.id and mb.period = '2026-06'
where a.account_id = makerkit.get_account_id_by_slug('assoc-a');

select results_eq(
  $$ select delta from public.electricity_reconciliation
     where period = '2026-06'
       and association_id = (select id from public.associations
                             where account_id = makerkit.get_account_id_by_slug('assoc-a')) $$,
  $$ values (-2000.00::numeric) $$,
  'reconciliation delta is recovered_amount minus invoiced_amount (negative = shortfall)'
);

-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: one bill per (association, unit, period)
-- ─────────────────────────────────────────────────────────────
insert into public.bills (association_id, unit_id, period, bill_no, total_amount, due_date)
select a.id, u.id, '2026-06', 'A-0001', 1200.00, '2026-07-10'
from public.units u
join public.associations a on a.id = u.association_id
where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100';

select throws_ok(
  $$ insert into public.bills (association_id, unit_id, period, bill_no, total_amount, due_date)
     select a.id, u.id, '2026-06', 'A-0002', 999.00, '2026-07-10'
     from public.units u
     join public.associations a on a.id = u.association_id
     where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100' $$,
  '23505'::text,
  null::text,
  'a second bill for the same unit and period is rejected'
);

select throws_ok(
  $$ insert into public.bills (association_id, unit_id, period, bill_no, total_amount, due_date)
     select a.id, u.id, '2026-07', 'A-0001', 999.00, '2026-08-10'
     from public.units u
     join public.associations a on a.id = u.association_id
     where a.account_id = makerkit.get_account_id_by_slug('assoc-a') and u.unit_no = 'U-100' $$,
  '23505'::text,
  null::text,
  'a duplicate bill_no within one association is rejected'
);

select * from finish();

ROLLBACK;
