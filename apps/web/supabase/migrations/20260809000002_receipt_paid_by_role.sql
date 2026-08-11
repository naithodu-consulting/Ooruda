-- Receipt "Received From" — paid_by_role on cash_ledger_payments
--
-- Regular bill payments (payments table) already have paid_by_role.
-- Cash ledger due payments (cash_ledger_payments) had no such field,
-- so the PDF receipt could not determine who actually paid.
-- This adds the column and updates the record_due_payment RPC to accept it.

-- ── 1. Add paid_by_role to cash_ledger_payments ────────────────────────────

alter table public.cash_ledger_payments
  add column if not exists paid_by_role text not null default 'Owner'
    check (paid_by_role in ('Owner', 'Tenant'));

-- ── 2. Update record_due_payment to accept and persist paid_by_role ────────

drop function if exists public.record_due_payment(uuid, uuid, text, numeric, text, text);

create function public.record_due_payment(
  p_association_id uuid,
  p_unit_id        uuid,
  p_bill_type      text,
  p_amount         numeric,
  p_mode           text,
  p_reference_no   text default null,
  p_paid_by_role   text default 'Owner'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id  uuid;
  v_caller_role text;
  v_receipt_no  text;
begin
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_paid_by_role not in ('Owner', 'Tenant') then
    raise exception 'paid_by_role must be Owner or Tenant.';
  end if;

  v_receipt_no := public._allocate_ledger_doc_no(p_association_id, p_bill_type, current_date, 'CL');

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     reference_no, receipt_no, recorded_by, paid_by_role)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount, p_mode,
     p_reference_no, v_receipt_no, auth.uid(), p_paid_by_role)
  returning id into v_payment_id;

  insert into public.cash_ledger
    (association_id, unit_id, entry_type, bill_type, amount, direction,
     paid_by_name, entry_date, notes)
  values
    (p_association_id, p_unit_id, 'due_payment', p_bill_type, p_amount, 'credit',
     'Cash payment', current_date,
     'Payment via ' || p_mode ||
       coalesce(' · Ref: ' || p_reference_no, '') ||
       ' · Receipt: ' || v_receipt_no);

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text, text)
  to authenticated;
