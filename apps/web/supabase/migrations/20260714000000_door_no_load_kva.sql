-- Add optional door number to units
ALTER TABLE public.units
  ADD COLUMN door_no text;

-- Add optional sanctioned load (kVA) to associations
ALTER TABLE public.associations
  ADD COLUMN sanctioned_load_kva numeric(8, 2);

-- Add optional sanctioned load (kVA) to sub_meters
ALTER TABLE public.sub_meters
  ADD COLUMN load_kva numeric(8, 2);
