-- =============================================================
-- Payment Reversal Support (Razorpay refunds)
--
-- When Razorpay refunds a payment, the webhook marks the row as
-- 'reversed' instead of deleting it so the audit trail is preserved.
-- The sync_bill_payment_status trigger is updated to only sum
-- 'active' payments, so reversed payments automatically un-pay bills.
-- =============================================================

-- ── 1. Add status + reversed_at to payments ──────────────────
alter table public.payments
  add column if not exists status text not null default 'active'
    check (status in ('active', 'reversed'));

alter table public.payments
  add column if not exists reversed_at timestamptz;

-- ── 2. Add status + reversed_at to cash_ledger_payments ──────
alter table public.cash_ledger_payments
  add column if not exists status text not null default 'active'
    check (status in ('active', 'reversed'));

alter table public.cash_ledger_payments
  add column if not exists reversed_at timestamptz;

-- ── 3. Grant UPDATE to service_role (used by the webhook) ────
grant update on public.payments             to service_role;
grant update on public.cash_ledger_payments to service_role;

-- ── 4. Update sync_bill_payment_status to exclude reversed ───
-- Only 'active' payments count toward paid_amount / bill status.
create or replace function public.sync_bill_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id         uuid;
  v_total_amount    numeric;
  v_advance_applied numeric;
  v_new_paid        numeric;
  v_effective_paid  numeric;
  v_status          text;
begin
  if tg_op = 'DELETE' then
    v_bill_id := old.bill_id;
  else
    v_bill_id := new.bill_id;
  end if;

  select total_amount, coalesce(advance_applied, 0)
    into v_total_amount, v_advance_applied
  from public.bills
  where id = v_bill_id;

  if not found then
    return null;
  end if;

  -- Only active (non-reversed) payments count.
  select coalesce(sum(amount), 0) into v_new_paid
  from public.payments
  where bill_id = v_bill_id
    and status = 'active';

  v_effective_paid := v_new_paid + v_advance_applied;

  v_status := case
    when v_effective_paid >= v_total_amount then 'Paid'
    when v_effective_paid > 0              then 'Partial'
    else                                        'Unpaid'
  end;

  -- paid_amount stores only active cash payments (not advance) for reporting clarity.
  -- Clear the cached PDF so the next download reflects the new status.
  update public.bills
  set paid_amount      = v_new_paid,
      status           = v_status,
      pdf_url          = null,
      pdf_generated_at = null
  where id = v_bill_id;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

-- ── 5. record_payment_reversal ────────────────────────────────
-- Called by the Razorpay webhook (refund.processed) via the admin
-- client (service_role). Marks the payment(s) for a Razorpay
-- payment ID as reversed, triggering the status trigger on bills.
-- For cash-ledger due payments, also adds a reversal debit entry
-- in cash_ledger so the outstanding balance is restored.
create or replace function public.record_payment_reversal(
  p_razorpay_payment_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clp record;
begin
  -- Reverse standard bill payments (trigger recomputes bill status).
  update public.payments
  set status      = 'reversed',
      reversed_at = now()
  where razorpay_payment_id = p_razorpay_payment_id
    and status = 'active';

  -- Reverse cash-ledger due payments and add a matching debit entry
  -- so the unit's outstanding balance is restored in the ledger.
  for v_clp in (
    select id, association_id, unit_id, bill_type, amount
    from public.cash_ledger_payments
    where razorpay_payment_id = p_razorpay_payment_id
      and status = 'active'
  ) loop
    update public.cash_ledger_payments
    set status      = 'reversed',
        reversed_at = now()
    where id = v_clp.id;

    insert into public.cash_ledger
      (association_id, unit_id, entry_type, bill_type, amount, direction,
       paid_by_name, entry_date, notes)
    values
      (v_clp.association_id, v_clp.unit_id, 'due_payment', v_clp.bill_type,
       v_clp.amount, 'debit',
       'Razorpay refund', current_date,
       'Payment reversed via Razorpay (ref: ' || p_razorpay_payment_id || ')');
  end loop;
end;
$$;

grant execute on function public.record_payment_reversal(text) to service_role;
