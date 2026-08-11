-- Generate receipt_no for Razorpay due payments so receipt PDFs have a
-- proper reference number instead of falling back to the payment UUID.

create or replace function public.record_due_payment_webhook(
  p_association_id      uuid,
  p_unit_id             uuid,
  p_bill_type           text,
  p_amount              numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_seq        bigint;
  v_receipt_no text;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select count(*) + 1 into v_seq
  from public.cash_ledger_payments
  where association_id = p_association_id
    and unit_id        = p_unit_id
    and bill_type      = p_bill_type;

  v_receipt_no := 'CL-' || upper(left(p_bill_type, 4)) || '-' ||
                  upper(left(p_unit_id::text, 6))       || '-R' ||
                  v_seq::text;

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     razorpay_payment_id, receipt_no)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount,
     'Razorpay', p_razorpay_payment_id, v_receipt_no)
  returning id into v_payment_id;

  insert into public.cash_ledger
    (association_id, unit_id, entry_type, bill_type, amount, direction,
     paid_by_name, entry_date, notes)
  values
    (p_association_id, p_unit_id, 'due_payment', p_bill_type, p_amount, 'credit',
     'Online payment', current_date,
     'Online payment via Razorpay (ref: ' || p_razorpay_payment_id ||
       ') · Receipt: ' || v_receipt_no);

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment_webhook(uuid, uuid, text, numeric, text)
  to service_role;
