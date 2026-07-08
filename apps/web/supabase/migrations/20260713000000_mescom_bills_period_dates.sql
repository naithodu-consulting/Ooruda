-- Add billing period date range to mescom_bills so the electricity bill PDF
-- can show the exact start and end dates of the billing period.
ALTER TABLE mescom_bills
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end   DATE;
