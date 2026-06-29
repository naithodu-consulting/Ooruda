-- Add unique constraint on (mescom_bill_id, sub_meter_id) so bulk imports can
-- use a single upsert call instead of N×2 sequential select+insert/update queries.
alter table public.meter_readings
  add constraint meter_readings_bill_meter_unique
  unique (mescom_bill_id, sub_meter_id);
