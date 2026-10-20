-- =============================================================
-- villa_bookings_mirror.discount_amount
--
-- A redeemed discount code never reached Ooruda. The booking site records the
-- saving in bookings.discount_amount, but the mirror had no column for it, so
-- reports computing revenue as base_amount + extra_guest_amount counted the
-- list price of every discounted stay and overstated revenue by the discount.
--
-- Rupees, matching the other money columns on this table (the booking site
-- stores paise; mirror.ts converts on the way in).
--
-- Constant default, so this is a metadata-only column add: no table rewrite.
-- Existing rows read as 0, which is correct — every stay already mirrored was
-- taken before discount codes went live, so none of them carried a discount.
-- =============================================================

alter table public.villa_bookings_mirror
  add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.villa_bookings_mirror
  add constraint villa_bookings_mirror_discount_amount_check
  check (discount_amount >= 0);

comment on column public.villa_bookings_mirror.discount_amount is
  'Rupees taken off the stay by a discount code, before GST. 0 when no code '
  'was used. Revenue is base_amount + extra_guest_amount - discount_amount.';
