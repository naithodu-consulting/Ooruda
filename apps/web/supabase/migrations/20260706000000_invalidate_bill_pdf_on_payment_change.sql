-- Bill PDFs are cached (bills.pdf_url) and include paid_amount/status/
-- outstanding. Those fields change whenever a payment is recorded, updated,
-- or voided against the bill (see sync_bill_payment_status below), but the
-- cached PDF was never invalidated — a tenant could download a bill showing
-- "Unpaid", pay it, and download again to see the same stale "Unpaid" PDF.
--
-- Clear the cache here, in the same trigger that already recomputes
-- paid_amount/status, so it's invalidated regardless of which code path
-- changed the payment (not just the two known action functions).
create or replace function public.sync_bill_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
  v_total_amount numeric;
  v_new_paid numeric;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_bill_id := old.bill_id;
  else
    v_bill_id := new.bill_id;
  end if;

  -- Get total amount from bill
  select total_amount into v_total_amount
  from public.bills
  where id = v_bill_id;

  if not found then
    return null;
  end if;

  -- Compute sum of active payments
  select coalesce(sum(amount), 0) into v_new_paid
  from public.payments
  where bill_id = v_bill_id;

  -- Determine status
  v_status := case
    when v_new_paid >= v_total_amount then 'Paid'
    when v_new_paid > 0 then 'Partial'
    else 'Unpaid'
  end;

  -- Update the bill, clearing any cached PDF so the next download
  -- regenerates with the current paid_amount/status.
  update public.bills
  set paid_amount = v_new_paid,
      status = v_status,
      pdf_url = null,
      pdf_generated_at = null
  where id = v_bill_id;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;
