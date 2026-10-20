-- =============================================================
-- Increase max_uses_per_guest limit from 20 to 999
-- =============================================================

alter table public.villa_discount_codes
  drop constraint if exists villa_discount_codes_max_uses_per_guest_check;

alter table public.villa_discount_codes
  add constraint villa_discount_codes_max_uses_per_guest_check
  check (max_uses_per_guest >= 1 and max_uses_per_guest <= 999);
