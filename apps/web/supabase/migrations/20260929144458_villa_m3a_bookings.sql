-- =============================================================
-- Ooruda Villa M3a — bookings: cancellation reasons + activity trail
-- (OORUDA_VILLA_PLAN.md §5, §9c)
--
-- Bookings themselves live on the villa-booking database. Ooruda keeps:
--   villa_cancellation_reasons  the fixed list owners pick from (§9c), as a
--                               lookup table so adding one is a row, not a
--                               migration
--   villa_booking_activity      who did what to which booking, when, and why
--                               (created / cancelled / completed / note)
-- =============================================================

-- ── 1. Cancellation reasons ───────────────────────────────────
create table if not exists public.villa_cancellation_reasons (
  code           text primary key check (code ~ '^[a-z_]+$'),
  label          text not null,
  initiated_by   text not null check (initiated_by in ('guest', 'host', 'system', 'external', 'any')),
  -- What the refund screen pre-fills (M5); the owner can override.
  default_refund text not null check (default_refund in ('policy', 'full', 'none', 'owner_decides')),
  note_required  boolean not null default false,
  display_order  smallint not null,
  is_active      boolean not null default true
);

insert into public.villa_cancellation_reasons
  (code, label, initiated_by, default_refund, note_required, display_order) values
  ('guest_change_of_plans',        'Guest changed plans',                                  'guest',    'policy',        false, 10),
  ('guest_travel_disruption',      'Travel disruption (flight, train or road)',            'guest',    'policy',        false, 20),
  ('guest_medical_or_bereavement', 'Medical emergency or bereavement',                     'guest',    'policy',        false, 30),
  ('guest_group_change',           'Group size or composition changed',                    'guest',    'policy',        false, 40),
  ('guest_duplicate_booking',      'Duplicate booking by the guest',                       'guest',    'full',          false, 50),
  ('no_show',                      'Guest did not arrive',                                 'guest',    'none',          false, 60),
  ('payment_not_received',         'Payment not received',                                 'system',   'full',          false, 70),
  ('payment_failed_or_disputed',   'Payment failed or charged back',                       'system',   'none',          false, 80),
  ('id_verification_failed',       'Valid ID not provided',                                'guest',    'policy',        false, 90),
  ('house_rules_violation',        'House rules violation (e.g. undeclared event)',        'guest',    'none',          true,  100),
  ('suspected_fraud',              'Suspected fraud',                                      'system',   'none',          true,  110),
  ('property_damage_or_repair',    'Damage or emergency repair at the villa',              'host',     'full',          false, 120),
  ('utility_outage',               'Power or water outage',                                'host',     'full',          false, 130),
  ('scheduled_maintenance',        'Scheduled maintenance',                                'host',     'full',          false, 140),
  ('double_booking',               'Double booking or channel conflict',                   'host',     'full',          false, 150),
  ('owner_use',                    'Owner using the villa',                                'host',     'full',          false, 160),
  ('pricing_error',                'Rate or pricing error',                                'host',     'full',          false, 170),
  ('force_majeure',                'Weather, disaster, government order or local unrest',  'external', 'full',          false, 180),
  ('other',                        'Other',                                                'any',      'owner_decides', true,  190)
on conflict (code) do nothing;

alter table public.villa_cancellation_reasons enable row level security;
revoke all on public.villa_cancellation_reasons from anon, authenticated, service_role;
grant select on public.villa_cancellation_reasons to authenticated, service_role;

create policy villa_cancellation_reasons_read on public.villa_cancellation_reasons
  for select to authenticated using (true);

-- ── 2. Booking activity ───────────────────────────────────────
create table if not exists public.villa_booking_activity (
  id              uuid primary key default extensions.uuid_generate_v4(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  property_id     uuid not null references public.villa_properties (id) on delete cascade,
  -- bookings.id / booking_code on the villa-booking database
  site_booking_id uuid not null,
  booking_code    text,
  action          text not null check (action in ('created', 'cancelled', 'completed', 'note')),
  reason_code     text references public.villa_cancellation_reasons (code),
  note            text check (note is null or length(note) <= 1000),
  actor_user_id   uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  -- A cancellation always says why.
  constraint villa_booking_activity_cancel_reason
    check (action <> 'cancelled' or reason_code is not null)
);

create index if not exists villa_booking_activity_booking_idx
  on public.villa_booking_activity (property_id, site_booking_id, created_at);
create index if not exists villa_booking_activity_account_idx
  on public.villa_booking_activity (account_id, created_at desc);
create index if not exists villa_booking_activity_reason_idx
  on public.villa_booking_activity (reason_code);
create index if not exists villa_booking_activity_actor_idx
  on public.villa_booking_activity (actor_user_id);

create trigger villa_booking_activity_scope
  before insert or update of account_id, property_id on public.villa_booking_activity
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_booking_activity enable row level security;
revoke all on public.villa_booking_activity from anon, authenticated, service_role;
grant select on public.villa_booking_activity to authenticated;
-- Written ONLY by the server (service role), after it has authorised the
-- action and made the change on the booking site. Members must not be able to
-- insert rows directly: a hand-made "cancelled" entry would forge history.
grant select, insert on public.villa_booking_activity to service_role;

create policy villa_booking_activity_read on public.villa_booking_activity
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());
