-- =============================================================
-- Week 2 (additive) — Write policies for tenancies
--
-- `tenancies` shipped in 20260612000000 with only a `member_read` SELECT
-- policy, so nobody could create or end a tenancy. This adds admin write
-- policies using the same pattern as 20260622000000_units_write_policies.sql.
-- Purely additive: new policies on an existing table, no change to the
-- existing read policy.
--
-- Assigning/ending tenants is an admin task, so writes are restricted to
-- `assoc_admin`. There's no tenancy "update" path beyond setting end_date
-- (ending a tenancy), which is covered by admin_update.
-- =============================================================

create policy "admin_insert" on public.tenancies
  for insert
  with check (
    exists (
      select 1 from public.units u
      where u.id = unit_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );

create policy "admin_update" on public.tenancies
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

create policy "admin_delete" on public.tenancies
  for delete
  using (
    exists (
      select 1 from public.units u
      where u.id = unit_id and public.association_role(u.association_id) = 'assoc_admin'
    )
  );
