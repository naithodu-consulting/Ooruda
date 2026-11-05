-- =============================================================
-- Ooruda Villa — Adjusting a booking's money (edit booking Phase 2)
--
-- Adds 'amount_adjusted' to the villa_booking_activity action check
-- constraint. Every adjustment writes one, with a mandatory reason and a
-- rupee-level diff of the stay charge, extra guests, discount, GST and total.
--
-- Constraint-only: no column changes, so `database.types.ts` is unaffected
-- and no typegen run is needed (`action` is already `text`).
-- =============================================================

-- Adding a validated CHECK takes ACCESS EXCLUSIVE and scans the table, and
-- this is the most append-heavy villa table. The scan is quick at today's
-- size, but a lock_timeout means a blocked attempt fails fast instead of
-- queueing behind a long reader and holding every writer up behind it. The
-- whole file runs in one transaction (Supabase CLI), so there is no window in
-- which no constraint exists.
set local lock_timeout = '5s';

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
