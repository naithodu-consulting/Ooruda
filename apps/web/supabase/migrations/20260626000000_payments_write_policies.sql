-- =============================================================
-- Week 2 (additive) — Write policies for payments + receipts
--
-- `payments`/`receipts` shipped in 20260612000000 with only a `member_read`
-- SELECT policy, so nobody could record a payment. This adds write policies
-- using the same operator/admin pattern as 20260614000003_assoc_setup.sql
-- and 20260625000000_billing_write_policies.sql: recording a payment is an
-- operational task, so `billing_operator` gets insert access alongside
-- `assoc_admin`. Voiding (deleting) a payment is restricted to `assoc_admin`.
--
-- `bills` also never got an UPDATE policy (20260625000000 only added insert
-- + delete), but recording/voiding a payment has to update bills.paid_amount
-- and bills.status — so this adds that, same operator/admin role split.
--
-- Purely additive: new policies on existing tables, no change to the
-- existing read policies.
-- =============================================================

create policy "operator_update" on public.bills
  for update
  using (public.association_role(association_id) in ('assoc_admin', 'billing_operator'))
  with check (public.association_role(association_id) in ('assoc_admin', 'billing_operator'));

create policy "operator_insert" on public.payments
  for insert
  with check (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );

create policy "admin_delete" on public.payments
  for delete
  using (public.association_role(association_id) = 'assoc_admin');

create policy "operator_insert" on public.receipts
  for insert
  with check (
    exists (
      select 1 from public.payments p
      where p.id = payment_id
        and public.association_role(p.association_id) in ('assoc_admin', 'billing_operator')
    )
  );

create policy "admin_delete" on public.receipts
  for delete
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id and public.association_role(p.association_id) = 'assoc_admin'
    )
  );
