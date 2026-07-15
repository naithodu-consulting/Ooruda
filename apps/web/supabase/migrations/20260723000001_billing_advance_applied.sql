-- =============================================================
-- Update billing DB functions to account for advance_applied
--
-- 1. create_bill_with_items — accept p_advance_applied and set
--    it on the bill; derive initial status from effective paid.
-- 2. sync_bill_payment_status — factor in advance_applied when
--    computing status after a cash payment changes.
-- 3. record_payment — prevent overpayment on bills that have
--    advance already applied.
-- 4. recompute_overdue_bills — skip bills whose advance alone
--    covers the total (already Paid).
-- =============================================================

-- ── 1. create_bill_with_items ─────────────────────────────────
create or replace function public.create_bill_with_items(
  p_association_id uuid,
  p_unit_id        uuid,
  p_period         text,
  p_bill_no        text,
  p_due_date       date,
  p_total_amount   numeric,
  p_line_items     jsonb,
  p_bill_type      varchar(20)    default 'maintenance',
  p_gst_amount     numeric(12, 2) default null,
  p_tenancy_id     uuid           default null,
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

  return v_bill_id;
end;
$$;

-- Revoke old grant (old 10-arg signature) and grant new 11-arg signature.
revoke execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric, uuid)
  from authenticated;

grant execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric, uuid, numeric)
  to authenticated;

-- ── 2. sync_bill_payment_status ───────────────────────────────
-- Factor advance_applied into effective paid so status is correct
-- after a cash payment is recorded against a partially-advanced bill.
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

  select coalesce(sum(amount), 0) into v_new_paid
  from public.payments
  where bill_id = v_bill_id;

  -- Effective paid = actual cash payments + advance already applied at generation.
  v_effective_paid := v_new_paid + v_advance_applied;

  v_status := case
    when v_effective_paid >= v_total_amount then 'Paid'
    when v_effective_paid > 0              then 'Partial'
    else                                        'Unpaid'
  end;

  -- paid_amount stores only actual cash payments (not advance) for reporting clarity.
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

-- ── 3. record_payment ─────────────────────────────────────────
-- Include advance_applied in the outstanding calculation so a bill
-- that was fully covered by advance cannot receive additional cash.
create or replace function public.record_payment(
  p_bill_id        uuid,
  p_association_id uuid,
  p_amount         numeric,
  p_mode           text,
  p_paid_by_role   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_amount    numeric;
  v_paid_amount     numeric;
  v_advance_applied numeric;
  v_bill_no         text;
  v_outstanding     numeric;
  v_payment_id      uuid;
  v_existing_count  bigint;
  v_caller_role     text;
begin
  -- 1. Authorization check.
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  -- 2. Fetch bill details including advance_applied.
  select total_amount, paid_amount, coalesce(advance_applied, 0), bill_no
    into v_total_amount, v_paid_amount, v_advance_applied, v_bill_no
  from public.bills
  where id = p_bill_id and association_id = p_association_id;

  if not found then
    raise exception 'Bill not found.';
  end if;

  -- 3. Validate: cannot exceed net outstanding (excluding advance already applied).
  v_outstanding := v_total_amount - v_paid_amount - v_advance_applied;
  if p_amount > v_outstanding then
    raise exception 'Amount exceeds the outstanding balance (%).', v_outstanding;
  end if;

  -- 4. Count existing payments for receipt number.
  select count(*) into v_existing_count
  from public.payments
  where bill_id = p_bill_id;

  -- 5. Insert payment (fires trg_sync_bill_payment trigger).
  insert into public.payments
    (association_id, bill_id, amount, mode, paid_by_role, recorded_by)
  values
    (p_association_id, p_bill_id, p_amount, p_mode, p_paid_by_role, auth.uid())
  returning id into v_payment_id;

  -- 6. Insert receipt.
  insert into public.receipts (payment_id, receipt_no)
  values (v_payment_id, v_bill_no || '-R' || (v_existing_count + 1));

  return v_payment_id;
end;
$$;

grant execute on function public.record_payment(uuid, uuid, numeric, text, text) to authenticated;

-- ── 4. recompute_overdue_bills ────────────────────────────────
-- Exclude bills already fully covered by advance (effective paid ≥ total).
create or replace function public.recompute_overdue_bills()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
  set status = 'Overdue'
  where status in ('Unpaid', 'Partial')
    and due_date < current_date
    and total_amount > 0
    -- Only mark overdue when net cash still owed (advance doesn't cover it).
    and (paid_amount + coalesce(advance_applied, 0)) < total_amount;
end;
$$;
