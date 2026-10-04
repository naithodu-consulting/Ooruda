-- =============================================================
-- villa_bookings_mirror.discount_code
--
-- The booking site records which coupon code was used (or null when none).
-- Storing it here lets Ooruda show per-code redemption stats without querying
-- the external booking site each time.
--
-- text, nullable; null = no code used, consistent with the booking site.
-- =============================================================

alter table public.villa_bookings_mirror
  add column if not exists discount_code text;

comment on column public.villa_bookings_mirror.discount_code is
  'Coupon code used at checkout (uppercased), or null when none.';
