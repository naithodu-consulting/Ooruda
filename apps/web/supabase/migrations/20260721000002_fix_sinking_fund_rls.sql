-- Fix RLS policies on pending_sinking_fund_charges.
-- The original policies used a raw accounts_memberships join which compared
-- association_id (associations.id) against account_id (accounts.id) — wrong UUIDs.
-- Correct pattern uses the association_role() helper, matching pending_other_charges.

drop policy if exists "assoc members can read pending_sinking_fund_charges" on public.pending_sinking_fund_charges;
drop policy if exists "billing operators can insert pending_sinking_fund_charges" on public.pending_sinking_fund_charges;
drop policy if exists "billing operators can update pending_sinking_fund_charges" on public.pending_sinking_fund_charges;
drop policy if exists "billing operators can delete pending_sinking_fund_charges" on public.pending_sinking_fund_charges;

create policy "billing operators can read pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for select
  using (
    association_role(association_id) = any (array['assoc_admin', 'billing_operator'])
  );

create policy "billing operators can insert pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for insert
  with check (
    association_role(association_id) = any (array['assoc_admin', 'billing_operator'])
  );

create policy "billing operators can update pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for update
  using (
    association_role(association_id) = any (array['assoc_admin', 'billing_operator'])
  );

create policy "billing operators can delete pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for delete
  using (
    association_role(association_id) = any (array['assoc_admin', 'billing_operator'])
  );
