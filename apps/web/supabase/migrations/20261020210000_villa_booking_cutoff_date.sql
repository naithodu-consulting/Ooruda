-- Add an optional booking cutoff date to villa_account_settings.
-- When set, Ooruda refuses to create bookings with check-in beyond this date.
-- NULL = no cutoff (open-ended).
ALTER TABLE public.villa_account_settings
  ADD COLUMN IF NOT EXISTS booking_cutoff_date date;

COMMENT ON COLUMN public.villa_account_settings.booking_cutoff_date IS
  'Last allowed check-in date for new bookings. NULL means no limit.';
