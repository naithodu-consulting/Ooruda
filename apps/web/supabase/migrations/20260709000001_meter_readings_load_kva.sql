-- Add load_kva to meter_readings so sanctioned load can vary per billing period.
-- NULL for historical records (imported before this column existed).
ALTER TABLE public.meter_readings
  ADD COLUMN load_kva numeric(8, 2);
