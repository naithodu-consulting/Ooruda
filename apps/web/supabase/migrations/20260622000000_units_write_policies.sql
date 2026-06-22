-- =============================================================
-- Week 2 (additive) — Write policies for units
--
-- `units` shipped in 20260612000000 with only a `member_read` SELECT policy, so
-- nobody could create/edit/delete units. This adds admin write policies using
-- the same `public.association_role()` helper and naming convention as
-- 20260614000003_assoc_setup.sql. Purely additive: new policies on an existing
-- table, no change to the existing read policy.
--
-- Unit setup (adding shops/offices, area, owner) is an admin task, so writes are
-- restricted to `assoc_admin`. billing_operator keeps read-only access via the
-- existing member_read policy.
-- =============================================================

create policy "admin_insert" on public.units
  for insert
  with check (public.association_role(association_id) = 'assoc_admin');

create policy "admin_update" on public.units
  for update
  using (public.association_role(association_id) = 'assoc_admin')
  with check (public.association_role(association_id) = 'assoc_admin');

create policy "admin_delete" on public.units
  for delete
  using (public.association_role(association_id) = 'assoc_admin');
