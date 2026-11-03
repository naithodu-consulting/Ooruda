-- =============================================================
-- Ooruda Villa — Guest Check-In Flow
--
-- 1. Adds checked_in_at timestamptz to villa_bookings_mirror
-- 2. Adds 'checked_in' to villa_booking_activity action check constraint
-- =============================================================

-- ── 1. villa_bookings_mirror ─────────────────────────────────
alter table public.villa_bookings_mirror
  add column if not exists checked_in_at timestamptz;

-- ── 2. villa_booking_activity ────────────────────────────────
alter table public.villa_booking_activity
  drop constraint if exists villa_booking_activity_action_check;

alter table public.villa_booking_activity
  add constraint villa_booking_activity_action_check
  check (action in (
    'created',
    'cancelled',
    'completed',
    'reopened',
    'checked_in',
    'note',
    'payment_recorded',
    'payment_voided',
    'refund_recorded',
    'id_recorded',
    'id_verified',
    'id_deleted',
    'email_sent',
    'guest_added',
    'guest_removed'
  ));
