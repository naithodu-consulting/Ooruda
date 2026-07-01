-- Restrict unit deletion to super admins only
drop policy if exists "admin_delete" on public.units;

create policy "admin_delete" on public.units
  for delete
  using (public.is_super_admin());
