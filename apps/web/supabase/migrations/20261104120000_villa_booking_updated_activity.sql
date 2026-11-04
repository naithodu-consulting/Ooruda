-- =============================================================
-- Ooruda Villa — Editing a booking's guest details (Phase 1)
--
-- Adds 'booking_updated' to the villa_booking_activity action check
-- constraint. Every edit to a booking's guest details writes one of these,
-- with a mandatory reason and a field-level diff in `note`.
--
-- Constraint-only: no column changes, so `database.types.ts` is unaffected
-- and no typegen run is needed (`action` is already `text`).
-- =============================================================

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
    'booking_updated',
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
