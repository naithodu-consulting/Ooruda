-- =============================================================
-- Partial Refund Support
--
-- Extends the reversal model to handle Razorpay partial refunds.
-- A partial refund reduces the effective paid amount without
-- marking the payment as fully reversed.
--
-- Changes:
-- 1. Add refunded_amount to payments and cash_ledger_payments
-- 2. Update sync_bill_payment_status to use (amount - refunded_amount)
-- 3. Update record_payment_reversal to accept an optional refund amount
-- =============================================================

-- ── 1. Add refunded_amount columns ───────────────────────────
alter table public.payments
  add column if not exists refunded_amount numeric(12, 2) not null default 0
    check (refunded_amount >= 0);

alter table public.cash_ledger_payments
  add column if not exists refunded_amount numeric(12, 2) not null default 0
    check (refunded_amount >= 0);

-- ── 2. Update trigger to use net paid (amount - refunded_amount) ─
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

  -- Net paid = sum of (amount - refunded_amount) for active payments only.
  -- Fully reversed payments (status='reversed') are excluded by the filter.
  -- Partially refunded payments contribute their remaining net amount.
  select coalesce(sum(amount - coalesce(refunded_amount, 0)), 0) into v_new_paid
  from public.payments
  where bill_id = v_bill_id
    and status = 'active';

  v_effective_paid := v_new_paid + v_advance_applied;

  v_status := case
    when v_effective_paid >= v_total_amount then 'Paid'
    when v_effective_paid > 0              then 'Partial'
    else                                        'Unpaid'
  end;

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

-- ── 3. Update record_payment_reversal ────────────────────────
-- p_refund_amount: the amount Razorpay refunded (in rupees).
--   NULL or >= remaining payment amount → full reversal (status='reversed').
--   < remaining payment amount          → partial refund (refunded_amount incremented).
--
-- Idempotent for full reversals. For partial refunds, repeated calls
-- accumulate refunded_amount; it becomes a full reversal once the total
-- reaches or exceeds the original payment amount.
drop function if exists public.record_payment_reversal(text);

create or replace function public.record_payment_reversal(
  p_razorpay_payment_id text,
  p_refund_amount       numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay          record;
  v_clp          record;
  v_new_refunded numeric;
  v_this_refund  numeric;
begin
  -- ── Standard bill payments ──────────────────────────────────
  for v_pay in (
    select id, amount, coalesce(refunded_amount, 0) as refunded_amount
    from public.payments
    where razorpay_payment_id = p_razorpay_payment_id
      and status = 'active'
  ) loop
    v_this_refund  := least(
                        coalesce(p_refund_amount, v_pay.amount),
                        v_pay.amount - v_pay.refunded_amount
                      );
    v_new_refunded := v_pay.refunded_amount + v_this_refund;

    if v_new_refunded >= v_pay.amount then
      -- Full reversal: trigger recomputes bill status.
      update public.payments
      set status          = 'reversed',
          refunded_amount = v_pay.amount,
          reversed_at     = now()
      where id = v_pay.id;
    else
      -- Partial refund: trigger recomputes bill status to Partial.
      update public.payments
      set refunded_amount = v_new_refunded
      where id = v_pay.id;
    end if;
  end loop;

  -- ── Cash-ledger due payments ────────────────────────────────
  for v_clp in (
    select id, association_id, unit_id, bill_type, amount,
           coalesce(refunded_amount, 0) as refunded_amount
    from public.cash_ledger_payments
    where razorpay_payment_id = p_razorpay_payment_id
      and status = 'active'
  ) loop
    v_this_refund  := least(
                        coalesce(p_refund_amount, v_clp.amount),
                        v_clp.amount - v_clp.refunded_amount
                      );
    v_new_refunded := v_clp.refunded_amount + v_this_refund;

    if v_new_refunded >= v_clp.amount then
      update public.cash_ledger_payments
      set status          = 'reversed',
          refunded_amount = v_clp.amount,
          reversed_at     = now()
      where id = v_clp.id;
    else
      update public.cash_ledger_payments
      set refunded_amount = v_new_refunded
      where id = v_clp.id;
    end if;

    -- Insert a debit into cash_ledger to restore the outstanding balance.
    insert into public.cash_ledger
      (association_id, unit_id, entry_type, bill_type, amount, direction,
       paid_by_name, entry_date, notes)
    values
      (v_clp.association_id, v_clp.unit_id, 'due_payment', v_clp.bill_type,
       v_this_refund, 'debit',
       'Razorpay refund', current_date,
       'Payment refunded via Razorpay (ref: ' || p_razorpay_payment_id || ')');
  end loop;
end;
$$;

grant execute on function public.record_payment_reversal(text, numeric) to service_role;
