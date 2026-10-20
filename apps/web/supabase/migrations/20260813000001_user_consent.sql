-- User Consent Gate
-- Stores when a user accepted the Ooruda User Consent.
-- NULL = not yet accepted (consent gate shown on next login).
-- Timestamptz records the exact moment of acceptance for legal purposes.

alter table public.profiles
  add column if not exists consent_accepted_at timestamptz default null;

comment on column public.profiles.consent_accepted_at is
  'Timestamp when the user accepted the Ooruda User Consent. NULL means not yet accepted; gate is shown on every login until accepted.';
