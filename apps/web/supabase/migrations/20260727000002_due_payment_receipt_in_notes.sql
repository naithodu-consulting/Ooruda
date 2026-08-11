-- Surface receipt_no inside the cash_ledger entry so the Statement view
-- can display it without a cross-table join.
-- Replaces the 6-arg function from 20260724000002.

create or replace function public.record_due_payment(
  p_association_id uuid,
  p_unit_id        uuid,
  p_bill_type      text,
  p_amount         numeric,
  p_mode           text,
  p_reference_no   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id  uuid;
  v_caller_role text;
  v_seq         bigint;
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

  select count(*) + 1 into v_seq
  from public.cash_ledger_payments
  where association_id = p_association_id
    and unit_id        = p_unit_id
    and bill_type      = p_bill_type;

  v_receipt_no := 'CL-' || upper(left(p_bill_type, 4)) || '-' ||
                  upper(left(p_unit_id::text, 6))     || '-R' ||
                  v_seq::text;

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     reference_no, receipt_no, recorded_by)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount, p_mode,
     p_reference_no, v_receipt_no, auth.uid())
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
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text)
  to authenticated;
