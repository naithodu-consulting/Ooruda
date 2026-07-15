-- The `pending_other_charges` table had read, insert, and delete policies but
-- no UPDATE policy. Bill generation marks staged charges as `billed = true`
-- after they are included in a generated bill, but under RLS that UPDATE
-- silently affected 0 rows — so billed charges kept re-appearing in the draft
-- staging list and blocked re-generating Other Charges in the same month.
--
-- Add an UPDATE policy (mirroring the delete policy) so billing operators /
-- assoc admins can flip the `billed` flag.

grant update on table pending_other_charges to authenticated;

create policy "billing operators can update pending other charges"
  on pending_other_charges for update
  using (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  )
  with check (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );
