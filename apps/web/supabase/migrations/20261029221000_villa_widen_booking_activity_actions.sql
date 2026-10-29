-- Widen villa_booking_activity action check constraint to track all important user actions:
-- payments, voids, refunds, guest IDs, guest membership, and email sends.

alter table public.villa_booking_activity
  drop constraint if exists villa_booking_activity_action_check;

alter table public.villa_booking_activity
  add constraint villa_booking_activity_action_check
  check (action in (
    'created',
    'cancelled',
    'completed',
    'reopened',
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
