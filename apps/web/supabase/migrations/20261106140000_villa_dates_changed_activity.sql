-- =============================================================
-- Ooruda Villa — Moving a booking's dates (edit booking Phase 3)
--
-- Adds 'dates_changed' to the villa_booking_activity action check
-- constraint. Every move writes one, with a mandatory reason and the old
-- and new spans.
--
-- Constraint-only: no column changes, so `database.types.ts` is unaffected
-- and no typegen run is needed (`action` is already `text`).
--
-- This restates the WHOLE list, as every migration touching this constraint
-- must: it is dropped and re-added, so an omitted value is silently lost.
-- Carries forward booking_updated (20261104120000), enrichment_voided
-- (20261105090000) and amount_adjusted (20261105140000).
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
    'amount_adjusted',
    'dates_changed',
    'enrichment_voided',
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
