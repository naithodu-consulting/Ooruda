-- Expand unit status values: Vacant (unsold), Self Occupied (owner, no tenant), Rented (active tenant).
-- 'Occupied' is retired; existing rows are migrated to 'Self Occupied'.
ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_status_check;

UPDATE public.units SET status = 'Self Occupied' WHERE status = 'Occupied';

ALTER TABLE public.units
  ADD CONSTRAINT units_status_check
  CHECK (status IN ('Vacant', 'Self Occupied', 'Rented'));
