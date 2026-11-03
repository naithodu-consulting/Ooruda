-- =============================================================
-- Ooruda Villa — Guest Check-Out Timestamp
--
-- Adds checked_out_at timestamptz to villa_bookings_mirror, the
-- counterpart to checked_in_at from 20261102203000.
--
-- The booking site records a check-out only as status = 'completed';
-- its updated_at moves on any edit, so there was no way to ask "who
-- was checked out today". The Today board needs exactly that, to show
-- a departure as done rather than silently dropping it off the board.
-- =============================================================

alter table public.villa_bookings_mirror
  add column if not exists checked_out_at timestamptz;
