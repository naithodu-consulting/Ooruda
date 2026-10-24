-- Villa M10: booking confirmation email toggle
--
-- Adds a per-account toggle for the automatic booking confirmation email
-- sent immediately when a manual booking is created. Defaults to true.

alter table public.villa_account_settings
  add column if not exists booking_confirmation_email boolean not null default true;

comment on column public.villa_account_settings.booking_confirmation_email is
  'Send an automatic confirmation email when a manual booking is created.';
