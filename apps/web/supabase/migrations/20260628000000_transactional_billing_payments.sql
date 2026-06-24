-- =============================================================
-- Week 2 (Design Concerns) — Transactional Billing & Payments
--
-- Exposes Postgres RPC functions for atomic transaction operations
-- (payments + receipt recording, bill + line item insertions) and
-- a database trigger to keep parent bills in sync with payments.
-- =============================================================

-- ─── 1. PAYMENT SYNCHRONIZATION TRIGGER ──────────────────────
-- Automatically updates a bill's paid_amount and status whenever a
-- payment is inserted, updated, or deleted, ensuring consistency.
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

  -- Update the bill
  update public.bills
  set paid_amount = v_new_paid,
      status = v_status
  where id = v_bill_id;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists trg_sync_bill_payment on public.payments;
create trigger trg_sync_bill_payment
  after insert or update or delete on public.payments
  for each row execute function public.sync_bill_payment_status();


-- ─── 2. ATOMIC PAYMENT RECORDING RPC ─────────────────────────
-- Creates a payment and receipt, validating constraints inside a transaction.
create or replace function public.record_payment(
  p_bill_id uuid,
  p_association_id uuid,
  p_amount numeric,
  p_mode text,
  p_paid_by_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_amount numeric;
  v_paid_amount numeric;
  v_bill_no text;
  v_outstanding numeric;
  v_payment_id uuid;
  v_existing_count bigint;
  v_caller_role text;
begin
  -- 1. Authorization check: must be admin or billing operator
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  -- 2. Fetch bill details
  select total_amount, paid_amount, bill_no
  into v_total_amount, v_paid_amount, v_bill_no
  from public.bills
  where id = p_bill_id and association_id = p_association_id;

  if not found then
    raise exception 'Bill not found.';
  end if;

  -- 3. Validate outstanding amount
  v_outstanding := v_total_amount - v_paid_amount;
  if p_amount > v_outstanding then
    raise exception 'Amount exceeds the outstanding balance (%).', v_outstanding;
  end if;

  -- 4. Count existing payments to generate receipt number
  select count(*) into v_existing_count
  from public.payments
  where bill_id = p_bill_id;

  -- 5. Insert payment (this will fire the trg_sync_bill_payment trigger automatically)
  insert into public.payments (association_id, bill_id, amount, mode, paid_by_role, recorded_by)
  values (p_association_id, p_bill_id, p_amount, p_mode, p_paid_by_role, auth.uid())
  returning id into v_payment_id;

  -- 6. Insert receipt
  insert into public.receipts (payment_id, receipt_no)
  values (v_payment_id, v_bill_no || '-R' || (v_existing_count + 1));

  return v_payment_id;
end;
$$;

grant execute on function public.record_payment(uuid, uuid, numeric, text, text) to authenticated;


-- ─── 3. ATOMIC BILL GENERATION RPC ───────────────────────────
-- Inserts a bill and its line items unpacked from a JSON array atomically.
create or replace function public.create_bill_with_items(
  p_association_id uuid,
  p_unit_id uuid,
  p_period text,
  p_bill_no text,
  p_due_date date,
  p_total_amount numeric,
  p_line_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
  v_caller_role text;
begin
  -- 1. Authorization check: must be admin or billing operator
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  -- 2. Insert bill
  insert into public.bills (association_id, unit_id, period, bill_no, total_amount, due_date, generated_by)
  values (p_association_id, p_unit_id, p_period, p_bill_no, p_total_amount, p_due_date, auth.uid())
  returning id into v_bill_id;

  -- 3. Insert line items
  insert into public.bill_line_items (bill_id, charge_type_id, description, payer, gst_applicable, amount)
  select
    v_bill_id,
    (item->>'charge_type_id')::uuid,
    (item->>'description')::text,
    (item->>'payer')::text,
    (item->>'gst_applicable')::boolean,
    (item->>'amount')::numeric
  from jsonb_array_elements(p_line_items) as item;

  return v_bill_id;
end;
$$;

grant execute on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb) to authenticated;
