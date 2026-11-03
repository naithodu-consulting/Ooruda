-- =============================================================
-- Ooruda Villa — Backfill checked_out_at from the activity log
--
-- `checked_out_at` was added in 20261103093000, so every stay checked
-- out before that has a null there and is missing from the Today
-- board's departed list. The activity log already holds the moment:
-- one row per check-out, action = 'completed'.
--
-- Idempotent and conservative:
--   - only rows that are still `completed` (a reopened stay is not a
--     departure, and its timestamp was cleared on reopen),
--   - only rows where checked_out_at is null, so a real check-out
--     stamped by the application is never overwritten,
--   - the LATEST 'completed' event, so a stay that was reopened and
--     checked out again carries the second check-out, not the first.
-- =============================================================

-- A correlated subquery, not UPDATE ... FROM LATERAL: a lateral cannot
-- reference the table being updated.
update public.villa_bookings_mirror m
set checked_out_at = (
  select a.created_at
  from public.villa_booking_activity a
  where a.property_id = m.property_id
    and a.site_booking_id = m.site_booking_id
    and a.action = 'completed'
  order by a.created_at desc
  limit 1
)
where m.status = 'completed'
  and m.checked_out_at is null
  and exists (
    select 1
    from public.villa_booking_activity a
    where a.property_id = m.property_id
      and a.site_booking_id = m.site_booking_id
      and a.action = 'completed'
  );
