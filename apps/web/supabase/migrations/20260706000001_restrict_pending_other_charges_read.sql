-- The original select policy only checked association membership
-- (any role, including tenant/prop_owner), while the insert/delete
-- policies on the same table correctly restrict to assoc_admin/
-- billing_operator. That let any tenant or owner read every unit's
-- un-finalized ad-hoc charges before bills are generated, relying
-- entirely on call sites remembering to add their own role gate rather
-- than RLS actually enforcing access control here. Tighten it to match
-- the sibling policies.
drop policy if exists "assoc members can read pending other charges" on pending_other_charges;

create policy "billing operators can read pending other charges"
  on pending_other_charges for select
  using (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );
