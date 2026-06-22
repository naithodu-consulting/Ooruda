-- =============================================================
-- Week 2 (additive) — Write policies for MESCOM / metering
--
-- `sub_meters`, `mescom_bills`, and `meter_readings` shipped in 20260612000000
-- with only `member_read` SELECT policies, so nobody could set up meters,
-- upload a bill, or record a reading. This adds admin write policies using
-- the same pattern as 20260622000000_units_write_policies.sql. Purely
-- additive: new policies on existing tables, no change to existing reads.
--
-- MESCOM setup/uploads/readings are admin tasks, so writes are restricted to
-- `assoc_admin`. billing_operator keeps read-only access via the existing
-- member_read policies. `electricity_reconciliation` is intentionally left
-- without write policies here — it's meant to be system-computed during bill
-- generation, not entered by hand.
-- =============================================================

create policy "admin_insert" on public.sub_meters
  for insert
  with check (
    exists (
      select 1 from public.units u
      where u.id = unit_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );

create policy "admin_update" on public.sub_meters
  for update
  using (
    exists (
      select 1 from public.units u
      where u.id = unit_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  )
  with check (
    exists (
      select 1 from public.units u
      where u.id = unit_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );

create policy "admin_insert" on public.mescom_bills
  for insert
  with check (public.association_role(association_id) = 'assoc_admin');

create policy "admin_update" on public.mescom_bills
  for update
  using (public.association_role(association_id) = 'assoc_admin')
  with check (public.association_role(association_id) = 'assoc_admin');

create policy "admin_insert" on public.meter_readings
  for insert
  with check (
    exists (
      select 1 from public.sub_meters sm
      join public.units u on u.id = sm.unit_id
      where sm.id = sub_meter_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );

create policy "admin_update" on public.meter_readings
  for update
  using (
    exists (
      select 1 from public.sub_meters sm
      join public.units u on u.id = sm.unit_id
      where sm.id = sub_meter_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  )
  with check (
    exists (
      select 1 from public.sub_meters sm
      join public.units u on u.id = sm.unit_id
      where sm.id = sub_meter_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );
