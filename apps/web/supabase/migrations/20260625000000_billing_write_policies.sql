-- =============================================================
-- Week 2 (additive) — Write policies for billing (bills + line items)
--
-- `bills`/`bill_line_items` shipped in 20260612000000 with only a
-- `member_read` SELECT policy, so nobody could generate a bill. This adds
-- write policies using the same pattern as 20260614000003_assoc_setup.sql
-- (which already covers billing_settings/charge_types): generating and
-- voiding bills is an operational task, so `billing_operator` gets insert
-- access alongside `assoc_admin`, matching the `billing.manage` permission
-- already granted to that role. Deleting (voiding) a bill is restricted to
-- `assoc_admin`. Purely additive: new policies on existing tables, no
-- change to the existing read policies.
-- =============================================================

create policy "operator_insert" on public.bills
  for insert
  with check (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );

create policy "admin_delete" on public.bills
  for delete
  using (public.association_role(association_id) = 'assoc_admin');

create policy "operator_insert" on public.bill_line_items
  for insert
  with check (
    exists (
      select 1 from public.bills b
      where b.id = bill_id
        and public.association_role(b.association_id) in ('assoc_admin', 'billing_operator')
    )
  );

create policy "admin_delete" on public.bill_line_items
  for delete
  using (
    exists (
      select 1 from public.bills b
      where b.id = bill_id and public.association_role(b.association_id) = 'assoc_admin'
    )
  );
