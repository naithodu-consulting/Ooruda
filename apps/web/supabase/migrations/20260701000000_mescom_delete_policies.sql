-- =============================================================
-- Add DELETE policies for MESCOM tables
--
-- The write-policies migration (20260624000000) added INSERT and UPDATE
-- but omitted DELETE. Without a DELETE policy, RLS silently blocks deletes
-- and returns success (204/no error) even though 0 rows are removed.
-- This migration adds admin_delete for mescom_bills, sub_meters, and
-- meter_readings to match the existing admin_insert/admin_update pattern.
-- meter_readings cascade-deletes when mescom_bills is deleted, but an
-- explicit policy is added for completeness and direct deletes.
-- =============================================================

create policy "admin_delete" on public.mescom_bills
  for delete
  using (public.association_role(association_id) = 'assoc_admin');

create policy "admin_delete" on public.sub_meters
  for delete
  using (
    exists (
      select 1 from public.units u
      where u.id = unit_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );

create policy "admin_delete" on public.meter_readings
  for delete
  using (
    exists (
      select 1 from public.sub_meters sm
      join public.units u on u.id = sm.unit_id
      where sm.id = sub_meter_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );
