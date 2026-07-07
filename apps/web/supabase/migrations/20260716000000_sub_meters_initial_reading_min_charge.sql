-- Add initial_reading: the meter reading from the month before onboarding.
-- Used as the previous_reading fallback when calculating the first month's
-- electricity bill for this meter (avoids billing the full cumulative reading).
ALTER TABLE public.sub_meters
  ADD COLUMN initial_reading numeric(12, 2) NOT NULL DEFAULT 0;

-- Add minimum_charge: the default monthly minimum charge for this meter.
-- Used as the minimum_charge on meter_readings when no per-reading override
-- is provided. Previously this was a per-reading field only; storing it on
-- the meter means it auto-fills every month without manual override.
ALTER TABLE public.sub_meters
  ADD COLUMN minimum_charge numeric(10, 2) NOT NULL DEFAULT 0;
