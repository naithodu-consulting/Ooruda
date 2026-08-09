-- ============================================================================
-- Electricity billing period alignment
--
-- Previously, electricity data was stored under the *reading* month:
--   mescom_bills.period  = 2026-06  (readings taken in June)
--   meter_readings.period = 2026-06
--   bills.period          = 2026-06  (but due_date = 2026-07-10)
--
-- From this migration onwards, all electricity data uses the *billing* month
-- (the month in which payment is collected), matching all other bill types:
--   mescom_bills.period  = 2026-07  (billed and collected in July)
--   meter_readings.period = 2026-07
--   bills.period          = 2026-07  (due_date = 2026-07-10)
--
-- The reading date range is captured in mescom_bills.period_start / period_end.
-- ============================================================================

-- Step 1: Safety check — abort if a collision would result from the +1-month
-- shift on mescom_bills (e.g., a Jan reading bill would collide with an
-- existing Feb billing bill for the same association).
do $$
declare
  collision_count integer;
begin
  select count(*) into collision_count
  from public.mescom_bills mb
  where exists (
    select 1 from public.mescom_bills mb2
    where mb2.association_id = mb.association_id
      and mb2.period = to_char(
            (to_date(mb.period, 'YYYY-MM') + interval '1 month'),
            'YYYY-MM'
          )
      and mb2.id <> mb.id
  );
  if collision_count > 0 then
    raise exception
      'Period shift would cause % unique-constraint collision(s) on mescom_bills. '
      'Resolve overlapping periods before running this migration.',
      collision_count;
  end if;
end $$;

-- Step 2: Backfill period_start / period_end on mescom_bills rows that are
-- missing them. Set to the first and last day of the *current* period (which
-- is the reading month in the old semantics) before we shift the period value.
update public.mescom_bills
set
  period_start = (to_date(period, 'YYYY-MM'))::date,
  period_end   = (to_date(period, 'YYYY-MM') + interval '1 month' - interval '1 day')::date
where period_start is null
   or period_end   is null;

-- Step 3: Shift mescom_bills.period forward by one month.
-- A plain UPDATE cannot ORDER BY, and the non-deferrable unique constraint
-- (association_id, period) is checked per-row immediately by PostgreSQL.
-- Shifting in descending order one row at a time avoids transient collisions
-- (e.g., shifting 2026-12 before 2026-11 means 2026-12→2027-01 never
-- conflicts with the still-unshifted 2026-12 row).
do $$
declare
  r record;
begin
  for r in
    select id from public.mescom_bills order by period desc
  loop
    update public.mescom_bills
    set period = to_char(
                   (to_date(period, 'YYYY-MM') + interval '1 month'),
                   'YYYY-MM'
                 )
    where id = r.id;
  end loop;
end $$;

-- Step 4: Shift meter_readings.period forward by one month.
update public.meter_readings
set period = to_char(
               (to_date(period, 'YYYY-MM') + interval '1 month'),
               'YYYY-MM'
             )
where true;

-- Step 5: Shift bills.period forward by one month for electricity bills only.
-- Note: the unique constraint (association_id, unit_id, period) on bills was
-- dropped in migration 20260701000001, so a plain UPDATE is safe here.
update public.bills
set period = to_char(
               (to_date(period, 'YYYY-MM') + interval '1 month'),
               'YYYY-MM'
             )
where bill_type = 'electricity';
