-- Clean up record_due_payment_webhook: store friendly notes instead of raw
-- Razorpay payment ID (the ID is already stored in cash_ledger_payments).
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
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode, razorpay_payment_id)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount,
     'Razorpay', p_razorpay_payment_id)
  returning id into v_payment_id;

  insert into public.cash_ledger
    (association_id, unit_id, entry_type, bill_type, amount, direction,
     paid_by_name, entry_date, notes)
  values
    (p_association_id, p_unit_id, 'due_payment', p_bill_type, p_amount, 'credit',
     'Online payment', current_date,
     'Paid via Razorpay');

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment_webhook(uuid, uuid, text, numeric, text)
  to service_role;
