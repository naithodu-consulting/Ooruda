-- =============================================================
-- record_payment: accept an explicit payment date, and collapse
-- the function back to a SINGLE definition.
--
-- Two problems are fixed here.
--
-- 1. Missing payment date.
--    `payments.paid_at` has always defaulted to now(), so a cash
--    payment collected on the 30th but entered on the 3rd was
--    stamped with the entry date. paid_at drives the receipt PDF,
--    every report's date-range filter and the unit account
--    statement, so the collection figures moved with the data-entry
--    lag. p_paid_at now carries the real date; NULL keeps now().
--
-- 2. Two live overloads, and the one the app calls is wrong.
--    20260703000001 dropped the stale 5-arg overload precisely
--    because PostgREST returns HTTP 300 when both are present.
--    20260723000001 then re-created that 5-arg version to add
--    advance_applied to the outstanding check — but the app calls
--    the 8-arg (Razorpay-aware) version, which never received that
--    fix. Net effect: a bill covered by advance credit reported its
--    outstanding as (total - paid), ignoring advance_applied, so a
--    second payment could be recorded against an already-settled
--    bill and overpay it.
--
--    This migration creates one 9-arg definition carrying BOTH the
--    advance_applied fix and the Razorpay/service_role logic, then
--    drops the 5-arg and 8-arg overloads. Because p_paid_at
--    defaults to NULL, callers passing the previous 8 named
--    arguments still resolve here — no deploy-order coupling
--    between this migration and the app.
-- =============================================================

create or replace function public.record_payment(
  p_bill_id              uuid,
  p_association_id       uuid,
  p_amount               numeric,
  p_mode                 text,
  p_paid_by_role         text,
  p_razorpay_payment_id  text        default null,
  p_razorpay_order_id    text        default null,
  p_payment_batch_id     uuid        default null,
  p_paid_at              timestamptz default null
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
  v_paid_at         timestamptz;
begin
  -- 1. Authorization.
  -- service_role callers (webhook handlers) bypass user-session checks.
  if auth.role() <> 'service_role' then
    select am.account_role into v_caller_role
    from public.associations a
    join public.accounts_memberships am on am.account_id = a.account_id
    where a.id = p_association_id
      and am.user_id = auth.uid()
    limit 1;

    if v_caller_role in ('prop_owner', 'tenant') then
      -- Self-service Razorpay only: signature verified before this RPC is called.
      if p_mode <> 'Razorpay' or p_razorpay_payment_id is null then
        raise exception 'Owners and tenants can only record Razorpay payments.';
      end if;
    elsif v_caller_role not in ('assoc_admin', 'billing_operator') then
      raise exception 'Only an association admin or billing operator can do that.';
    end if;
  end if;

  -- 2. Resolve the payment date. NULL means "now" (gateway payments and
  --    any caller that predates this parameter). A future date is never
  --    valid — money cannot have been received tomorrow. Small clock skew
  --    between the client and the DB is tolerated.
  v_paid_at := coalesce(p_paid_at, now());

  if v_paid_at > now() + interval '1 day' then
    raise exception 'Payment date cannot be in the future.';
  end if;

  -- 3. Fetch bill details including advance_applied.
  select total_amount, paid_amount, coalesce(advance_applied, 0), bill_no
    into v_total_amount, v_paid_amount, v_advance_applied, v_bill_no
  from public.bills
  where id = p_bill_id and association_id = p_association_id;

  if not found then
    raise exception 'Bill not found.';
  end if;

  -- 4. Validate: cannot exceed net outstanding. advance_applied must be
  --    subtracted, or a bill already settled by advance credit accepts a
  --    further payment and ends up overpaid.
  v_outstanding := v_total_amount - v_paid_amount - v_advance_applied;

  if p_amount > v_outstanding then
    raise exception 'Amount exceeds the outstanding balance (%).', v_outstanding;
  end if;

  -- 5. Count existing payments for receipt number generation.
  select count(*) into v_existing_count
  from public.payments
  where bill_id = p_bill_id;

  -- 6. Insert payment (fires trg_sync_bill_payment trigger automatically).
  insert into public.payments (
    association_id, bill_id, amount, mode, paid_by_role, recorded_by,
    razorpay_payment_id, razorpay_order_id, payment_batch_id, paid_at
  )
  values (
    p_association_id, p_bill_id, p_amount, p_mode, p_paid_by_role,
    auth.uid(),  -- null for webhook callers; recorded_by is nullable
    p_razorpay_payment_id, p_razorpay_order_id, p_payment_batch_id,
    v_paid_at
  )
  returning id into v_payment_id;

  -- 7. Insert receipt. Receipt numbers stay sequential by creation order,
  --    not by paid_at — a back-dated payment does not renumber earlier ones.
  insert into public.receipts (payment_id, receipt_no)
  values (v_payment_id, v_bill_no || '-R' || (v_existing_count + 1));

  return v_payment_id;
end;
$$;

-- Drop both stale overloads so exactly one definition remains. Leaving any
-- of them in place re-creates the HTTP 300 ambiguity documented in
-- 20260703000001, and lets callers reach the version without the
-- advance_applied fix.
drop function if exists public.record_payment(
  uuid,    -- p_bill_id
  uuid,    -- p_association_id
  numeric, -- p_amount
  text,    -- p_mode
  text     -- p_paid_by_role
);

drop function if exists public.record_payment(
  uuid,    -- p_bill_id
  uuid,    -- p_association_id
  numeric, -- p_amount
  text,    -- p_mode
  text,    -- p_paid_by_role
  text,    -- p_razorpay_payment_id
  text,    -- p_razorpay_order_id
  uuid     -- p_payment_batch_id
);

grant execute on function public.record_payment(
  uuid, uuid, numeric, text, text, text, text, uuid, timestamptz
) to authenticated;

grant execute on function public.record_payment(
  uuid, uuid, numeric, text, text, text, text, uuid, timestamptz
) to service_role;
