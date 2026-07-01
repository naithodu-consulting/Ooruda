-- =============================================================
-- Restrict electricity (mescom) bill deletion to super admins only
-- -------------------------------------------------------------
-- deleteElectricityBillAction (electricity-actions.ts) was tightened to
-- require is_super_admin(), mirroring the units-deletion restriction
-- (20260707000000_restrict_unit_deletion.sql). But the underlying RLS
-- policy on mescom_bills — "admin_delete", added in
-- 20260701000000_mescom_delete_policies.sql — still authorized any
-- assoc_admin, so an assoc_admin could bypass the server action entirely
-- via the browser's RLS-enforced Supabase client and delete a bill row
-- directly.
-- =============================================================

drop policy if exists "admin_delete" on public.mescom_bills;

create policy "admin_delete" on public.mescom_bills
  for delete
  using (public.is_super_admin());
