-- =============================================================
-- Cash Ledger Atomicity Fixes
--
-- A. Move advance-apply debit inside create_bill_with_items so
--    the bill creation and ledger debit are a single transaction.
-- B. New record_due_payment RPC for atomic due payment recording.
-- C. Revoke UPDATE grant on cash_ledger (entries are immutable).
-- =============================================================

-- ── Fix C: revoke UPDATE grant (ledger is append-only) ───────
revoke update on public.cash_ledger from authenticated;

-- ── Fix A: atomic advance-apply inside create_bill_with_items ─
-- Supersedes the 11-arg version from 20260723000001.
create or replace function public.create_bill_with_items(
  p_association_id  uuid,
  p_unit_id         uuid,
  p_period          text,
  p_bill_no         text,
  p_due_date        date,
  p_total_amount    numeric,
  p_line_items      jsonb,
  p_bill_type       varchar(20)    default 'maintenance',
  p_gst_amount      numeric(12, 2) default null,
  p_tenancy_id      uuid           default null,
  p_advance_applied numeric(12, 2) default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id      uuid;
  v_caller_role  text;
  v_adv          numeric;
  v_init_status  text;
  v_balance      numeric;
begin
  -- Authorization: must be admin or billing operator.
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  v_adv := coalesce(p_advance_applied, 0);

  -- Derive initial status from advance applied.
  v_init_status := case
    when v_adv >= p_total_amount then 'Paid'
    when v_adv > 0               then 'Partial'
    else                              'Unpaid'
  end;

  insert into public.bills
    (association_id, unit_id, period, bill_no, bill_type,
     total_amount, gst_amount, advance_applied, status, due_date,
     generated_by, tenancy_id)
  values
    (p_association_id, p_unit_id, p_period, p_bill_no, p_bill_type,
     p_total_amount, p_gst_amount, v_adv, v_init_status, p_due_date,
     auth.uid(), p_tenancy_id)
  returning id into v_bill_id;

  insert into public.bill_line_items
    (bill_id, charge_type_id, description, payer, gst_applicable,
     amount, area_sqft, rate_per_sqft)
  select
    v_bill_id,
    (item->>'charge_type_id')::uuid,
    (item->>'description')::text,
    (item->>'payer')::text,
    (item->>'gst_applicable')::boolean,
    (item->>'amount')::numeric,
    (item->>'area_sqft')::numeric,
    (item->>'rate_per_sqft')::numeric
  from jsonb_array_elements(p_line_items) as item;

  -- Atomically debit the advance from cash_ledger if advance was applied.
  -- Re-reads balance inside the transaction to guard against concurrent bill runs.
  if v_adv > 0 then
    select coalesce(
      sum(case when direction = 'credit' then amount else -amount end), 0
    ) into v_balance
    from public.cash_ledger
    where unit_id   = p_unit_id
      and bill_type = p_bill_type;

    -- Cap to actual available balance (caller may have computed a stale value).
    v_adv := least(v_adv, greatest(v_balance, 0));

    if v_adv > 0 then
      insert into public.cash_ledger
        (association_id, unit_id, entry_type, bill_type, amount, direction,
         reference_bill_id, paid_by_name, entry_date, notes)
      values
        (p_association_id, p_unit_id, 'advance_applied', p_bill_type, v_adv, 'debit',
         v_bill_id, 'Auto-applied', current_date,
         'Auto-applied to bill ' || p_bill_no || ' for ' || p_period);
    end if;
  end if;

  return v_bill_id;
end;
$$;

-- ── Fix B: atomic due payment RPC ────────────────────────────
create or replace function public.record_due_payment(
  p_association_id uuid,
  p_unit_id        uuid,
  p_bill_type      text,
  p_amount         numeric,
  p_mode           text,
  p_reference_no   text default null,
  p_receipt_no     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id  uuid;
  v_caller_role text;
begin
  -- Authorization check.
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

  -- Both inserts share the same transaction; if either fails, both roll back.
  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     reference_no, receipt_no, recorded_by)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount, p_mode,
     p_reference_no, p_receipt_no, auth.uid())
  returning id into v_payment_id;

  insert into public.cash_ledger
    (association_id, unit_id, entry_type, bill_type, amount, direction,
     paid_by_name, entry_date, notes)
  values
    (p_association_id, p_unit_id, 'due_payment', p_bill_type, p_amount, 'credit',
     'Cash payment', current_date,
     'Payment via ' || p_mode ||
       coalesce(' (ref: ' || p_reference_no || ')', ''));

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text, text)
  to authenticated;
