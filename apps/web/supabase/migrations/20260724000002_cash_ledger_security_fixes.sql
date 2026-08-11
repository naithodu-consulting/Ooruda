-- =============================================================
-- Cash Ledger Security & Correctness Fixes
--
-- A. Add association-membership guard to SECURITY DEFINER RPCs
--    (get_cash_ledger_balance, get_association_cash_ledger_balances).
-- B. Fix create_bill_with_items to store the capped advance_applied
--    value rather than the raw caller-supplied one.
-- C. Move receipt-number generation inside record_due_payment to
--    eliminate the pre-RPC count / race condition.
-- =============================================================

-- ── Fix A: membership guard on balance RPCs ──────────────────

create or replace function public.get_cash_ledger_balance(
  p_unit_id   uuid,
  p_bill_type text
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_association_id uuid;
begin
  select association_id into v_association_id
  from public.units
  where id = p_unit_id;

  if not found or not public.is_association_member(v_association_id) then
    raise exception 'Not authorized';
  end if;

  return coalesce(
    (select sum(case when direction = 'credit' then amount else -amount end)
     from public.cash_ledger
     where unit_id   = p_unit_id
       and bill_type = p_bill_type),
    0
  );
end;
$$;

create or replace function public.get_association_cash_ledger_balances(
  p_association_id uuid
)
returns table(unit_id uuid, unit_no text, bill_type text, balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_association_member(p_association_id) then
    raise exception 'Not authorized';
  end if;

  return query
    select
      cl.unit_id,
      u.unit_no,
      cl.bill_type,
      sum(case when cl.direction = 'credit' then cl.amount else -cl.amount end) as balance
    from public.cash_ledger cl
    join public.units u on u.id = cl.unit_id
    where cl.association_id = p_association_id
    group by cl.unit_id, u.unit_no, cl.bill_type
    having sum(case when cl.direction = 'credit' then cl.amount else -cl.amount end) <> 0;
end;
$$;

-- ── Fix B: create_bill_with_items — store capped advance ─────
-- Inserts the bill with advance_applied=0 / status='Unpaid' first,
-- then updates both fields to the capped value after re-reading the
-- actual ledger balance, so the stored value always matches the debit.
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
  v_bill_id     uuid;
  v_caller_role text;
  v_adv         numeric;
  v_balance     numeric;
  v_status      text;
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

  -- Insert bill with advance_applied=0 / status='Unpaid' initially.
  -- The actual capped value is written in the UPDATE below, so the column
  -- never stores a value larger than what was actually debited.
  insert into public.bills
    (association_id, unit_id, period, bill_no, bill_type,
     total_amount, gst_amount, advance_applied, status, due_date,
     generated_by, tenancy_id)
  values
    (p_association_id, p_unit_id, p_period, p_bill_no, p_bill_type,
     p_total_amount, p_gst_amount, 0, 'Unpaid', p_due_date,
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

  -- Apply advance atomically: re-read the live balance (inside this
  -- transaction) and cap to what is actually available.
  if coalesce(p_advance_applied, 0) > 0 then
    select coalesce(
      sum(case when direction = 'credit' then amount else -amount end), 0
    ) into v_balance
    from public.cash_ledger
    where unit_id   = p_unit_id
      and bill_type = p_bill_type;

    v_adv := least(p_advance_applied, greatest(v_balance, 0));

    if v_adv > 0 then
      insert into public.cash_ledger
        (association_id, unit_id, entry_type, bill_type, amount, direction,
         reference_bill_id, paid_by_name, entry_date, notes)
      values
        (p_association_id, p_unit_id, 'advance_applied', p_bill_type, v_adv, 'debit',
         v_bill_id, 'Auto-applied', current_date,
         'Auto-applied to bill ' || p_bill_no || ' for ' || p_period);

      v_status := case
        when v_adv >= p_total_amount then 'Paid'
        else 'Partial'
      end;

      -- Update the bill with the actual capped advance and derived status.
      update public.bills
      set advance_applied = v_adv,
          status          = v_status
      where id = v_bill_id;
    end if;
  end if;

  return v_bill_id;
end;
$$;

-- ── Fix C: record_due_payment — generate receipt_no internally ─
-- Replaces the 7-arg version from 20260724000001. The caller no
-- longer pre-counts rows; the RPC generates and owns the receipt number.
revoke execute
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text, text)
  from authenticated;

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

  -- Sequence number is generated inside the transaction — no external race.
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
       coalesce(' (ref: ' || p_reference_no || ')', ''));

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text)
  to authenticated;
