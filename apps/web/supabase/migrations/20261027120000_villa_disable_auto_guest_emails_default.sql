-- Disable automatic pre_arrival and thank_you guest emails by default.
-- Only booking_confirmation remains enabled by default; villa_admin can
-- explicitly enable or disable pre_arrival and thank_you in Villa Settings.

alter table public.villa_account_settings
  alter column pre_arrival_email set default false,
  alter column thank_you_email set default false;

update public.villa_account_settings
set
  pre_arrival_email = false,
  thank_you_email = false;
