-- =============================================================
-- Backfill unit occupancy status
--
-- Bug: updateUnitAction/assignOwnerAction never set units.status when
-- an owner was assigned, so owner-owned units with no tenant stayed at
-- their default 'Vacant' instead of the intended 'Self Occupied'
-- (per 20260708000001_unit_status_self_occupied_rented.sql).
--
-- Correct the historical rows:
--   active tenant     → Rented
--   owner, no tenant  → Self Occupied
--   no owner          → Vacant
-- =============================================================

-- Owner set, no active tenancy → Self Occupied
update public.units u
set status = 'Self Occupied'
where u.owner_id is not null
  and u.status <> 'Self Occupied'
  and not exists (
    select 1 from public.tenancies t
    where t.unit_id = u.id and t.status = 'active'
  );

-- No owner, no active tenancy → Vacant
update public.units u
set status = 'Vacant'
where u.owner_id is null
  and u.status <> 'Vacant'
  and not exists (
    select 1 from public.tenancies t
    where t.unit_id = u.id and t.status = 'active'
  );

-- Active tenancy → Rented (guards against any drift)
update public.units u
set status = 'Rented'
where u.status <> 'Rented'
  and exists (
    select 1 from public.tenancies t
    where t.unit_id = u.id and t.status = 'active'
  );
