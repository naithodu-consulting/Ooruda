-- =============================================================
-- Ooruda Villa M7 — automated guest emails (OORUDA_VILLA_PLAN.md §8)
--
--   villa_message_log  one row per email decision: sent, skipped (and why)
--                      or failed. The automatic send for a booking and
--                      template is CLAIMED by inserting its row first; a
--                      unique index makes a second claim impossible, so a
--                      guest never gets the same automatic email twice.
--                      Manual sends ("Send again") are extra rows.
--   villa_account_settings: switches for each automatic email.
--   villa_booking_activity: 'reopened' (a check-out undone).
--
-- Timing rules live in lib/villa/guest-emails.ts:
--   pre_arrival  from 10:00 IST the day before check-in, only if the stay
--                is still confirmed for that date when re-read from the
--                booking site right before sending;
--   thank_you    3 hours after staff press Check out (never from the
--                calendar date), only if still checked out then.
-- =============================================================

create table if not exists public.villa_message_log (
  id              uuid primary key default extensions.uuid_generate_v4(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  property_id     uuid not null references public.villa_properties (id) on delete cascade,
  site_booking_id uuid not null,
  booking_code    text check (booking_code is null or length(booking_code) <= 32),
  template        text not null check (template in ('pre_arrival', 'thank_you')),
  -- The check-in the email was for: a moved stay gets a fresh arrival email.
  check_in        date,
  manual          boolean not null default false,
  status          text not null check (status in ('sending', 'sent', 'skipped', 'failed')),
  reason          text check (reason is null or length(reason) <= 300),
  to_email        text check (to_email is null or length(to_email) <= 320),
  provider_id     text check (provider_id is null or length(provider_id) <= 200),
  sent_by         uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The anti-double-send guard: one automatic decision per booking, email and
-- check-in date. Never re-claimed automatically: a send that failed or whose
-- outcome is unknown waits for staff ("Send now"), so a guest can never get
-- the same automatic email twice.
create unique index if not exists villa_message_log_auto_once
  on public.villa_message_log (
    property_id, site_booking_id, template, coalesce(check_in, '1900-01-01'::date)
  )
  where not manual;

create index if not exists villa_message_log_booking_idx
  on public.villa_message_log (property_id, site_booking_id, created_at);
create index if not exists villa_message_log_account_idx
  on public.villa_message_log (account_id, created_at desc);
create index if not exists villa_message_log_sent_by_idx
  on public.villa_message_log (sent_by);

create trigger villa_message_log_scope
  before insert or update of account_id, property_id on public.villa_message_log
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_message_log_updated_at
  before update on public.villa_message_log
  for each row execute function public.trigger_set_timestamps();

alter table public.villa_message_log enable row level security;
revoke all on public.villa_message_log from anon, authenticated, service_role;
grant select on public.villa_message_log to authenticated;
-- Written only by the server (the scheduler has no user session).
grant select, insert, update on public.villa_message_log to service_role;

create policy villa_message_log_read on public.villa_message_log
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── Switches ──────────────────────────────────────────────────
alter table public.villa_account_settings
  add column if not exists pre_arrival_email boolean not null default true,
  add column if not exists thank_you_email   boolean not null default true,
  -- Dashboard-triggered runs happen at most every few minutes per account.
  add column if not exists guest_emails_checked_at timestamptz;

-- ── Activity: undoing a check-out ─────────────────────────────
alter table public.villa_booking_activity
  drop constraint if exists villa_booking_activity_action_check;
alter table public.villa_booking_activity
  add constraint villa_booking_activity_action_check
  check (action in ('created', 'cancelled', 'completed', 'reopened', 'note'));
