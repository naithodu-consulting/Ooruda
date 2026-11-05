-- =============================================================
-- Ooruda Villa — Voiding a channel enrichment
--
-- Adds 'enrichment_voided' to the villa_booking_activity action check
-- constraint. Voiding retires a channel stay that was filled in by mistake:
-- it voids the auto-recorded payout receipt, removes the commission expense,
-- cancels the booking on the site, and logs this action with a mandatory
-- reason.
--
-- Why the site status stays 'cancelled' rather than becoming 'voided':
-- villa-booking's `bookings_channel_event_unique` partial index (its 00108)
-- excludes only `status <> 'cancelled'`. A row with any other status stays
-- inside that index, so re-enriching the same iCal event would fail on a
-- duplicate key forever - which is the opposite of what voiding is for. The
-- "created in error" distinction therefore lives here, in Ooruda's own
-- activity log, where we own the schema.
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
