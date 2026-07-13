-- =============================================================
-- Super-admin-only bulk delete for bills and payments.
--
-- Used to wipe test/seed billing data from an association. Both
-- RPCs are security definer with an explicit is_super_admin() check
-- inside — RLS alone can't gate this because a super admin viewing
-- an "opened workspace" resolves to the same 'assoc_admin' role as a
-- real customer admin (see association_role()), so the existing
-- assoc_admin delete policies on bills/payments must stay open for
-- normal single-bill/void operations and can't be tightened here.
-- =============================================================

-- Full wipe: deletes bills, which cascades to bill_line_items,
-- payments, and receipts. Also resets bill_sequences so the next
-- generated bill starts numbering clean instead of continuing from a
-- stale counter.
create or replace function public.super_admin_delete_all_bills(
  p_association_id uuid
)
returns table (deleted_bills int, deleted_payments int, deleted_receipts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_bills    int;
  v_deleted_payments int;
  v_deleted_receipts int;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can do that.';
  end if;

  select count(*) into v_deleted_receipts
    from public.receipts r
    join public.payments p on p.id = r.payment_id
    join public.bills b on b.id = p.bill_id
   where b.association_id = p_association_id;

  select count(*) into v_deleted_payments
    from public.payments p
    join public.bills b on b.id = p.bill_id
   where b.association_id = p_association_id;

  delete from public.bills where association_id = p_association_id;
  get diagnostics v_deleted_bills = row_count;

  delete from public.bill_sequences where association_id = p_association_id;

  return query select v_deleted_bills, v_deleted_payments, v_deleted_receipts;
end;
$$;

grant execute
  on function public.super_admin_delete_all_bills(uuid)
  to authenticated;

-- Payments-only wipe: deletes payments (cascades to receipts) but
-- leaves bills intact. bills.paid_amount/status revert to their
-- pre-payment state via the existing sync_bill_payment_status trigger.
create or replace function public.super_admin_delete_all_payments(
  p_association_id uuid
)
returns table (deleted_payments int, deleted_receipts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_payments int;
  v_deleted_receipts int;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can do that.';
  end if;

  select count(*) into v_deleted_receipts
    from public.receipts r
    join public.payments p on p.id = r.payment_id
   where p.association_id = p_association_id;

  delete from public.payments where association_id = p_association_id;
  get diagnostics v_deleted_payments = row_count;

  return query select v_deleted_payments, v_deleted_receipts;
end;
$$;

grant execute
  on function public.super_admin_delete_all_payments(uuid)
  to authenticated;
