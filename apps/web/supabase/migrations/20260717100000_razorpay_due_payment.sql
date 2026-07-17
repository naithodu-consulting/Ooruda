-- Razorpay online payment support for cash-ledger dues (prop_owner / tenant).
--
-- Changes:
-- A. Add razorpay_payment_id column to cash_ledger_payments for idempotency.
-- B. Allow 'Razorpay' as a payment mode in cash_ledger_payments.
-- C. Grant service_role INSERT on cash_ledger + cash_ledger_payments for webhook.
-- D. New record_due_payment_webhook() function callable by service_role.

-- A. Add razorpay_payment_id (nullable, unique — prevents double-recording).
alter table public.cash_ledger_payments
  add column if not exists razorpay_payment_id text unique;

-- B. Extend mode check to allow 'Razorpay'.
alter table public.cash_ledger_payments
  drop constraint if exists cash_ledger_payments_mode_check;

alter table public.cash_ledger_payments
  add constraint cash_ledger_payments_mode_check
    check (mode in ('Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Razorpay'));

-- C. Webhook runs as service_role — grant the minimum required INSERT.
grant insert on public.cash_ledger_payments to service_role;
grant insert on public.cash_ledger          to service_role;

-- D. Webhook-callable variant: no auth.uid() check; ownership is validated by
--    the create-order-due route before the Razorpay order is created.
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
     'Online payment via Razorpay (ref: ' || p_razorpay_payment_id || ')');

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment_webhook(uuid, uuid, text, numeric, text)
  to service_role;
