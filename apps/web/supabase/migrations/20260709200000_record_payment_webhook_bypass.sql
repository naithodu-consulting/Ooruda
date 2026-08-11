-- Allow service_role (webhook handlers) to call record_payment without a user session.
-- The existing user-facing auth checks are preserved for authenticated callers.

create or replace function public.record_payment(
  p_bill_id              uuid,
  p_association_id       uuid,
  p_amount               numeric,
  p_mode                 text,
  p_paid_by_role         text,
  p_razorpay_payment_id  text    default null,
  p_razorpay_order_id    text    default null,
  p_payment_batch_id     uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_amount    numeric;
  v_paid_amount     numeric;
  v_bill_no         text;
  v_outstanding     numeric;
  v_payment_id      uuid;
  v_existing_count  bigint;
  v_caller_role     text;
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

  -- 2. Fetch bill details.
  select total_amount, paid_amount, bill_no
  into v_total_amount, v_paid_amount, v_bill_no
  from public.bills
  where id = p_bill_id and association_id = p_association_id;

  if not found then
    raise exception 'Bill not found.';
  end if;

  -- 3. Validate outstanding amount.
  v_outstanding := v_total_amount - v_paid_amount;
  if p_amount > v_outstanding then
    raise exception 'Amount exceeds the outstanding balance (%).', v_outstanding;
  end if;

  -- 4. Count existing payments for receipt number generation.
  select count(*) into v_existing_count
  from public.payments
  where bill_id = p_bill_id;

  -- 5. Insert payment (fires trg_sync_bill_payment trigger automatically).
  insert into public.payments (
    association_id, bill_id, amount, mode, paid_by_role, recorded_by,
    razorpay_payment_id, razorpay_order_id, payment_batch_id
  )
  values (
    p_association_id, p_bill_id, p_amount, p_mode, p_paid_by_role,
    auth.uid(),  -- null for webhook callers; recorded_by is nullable
    p_razorpay_payment_id, p_razorpay_order_id, p_payment_batch_id
  )
  returning id into v_payment_id;

  -- 6. Insert receipt.
  insert into public.receipts (payment_id, receipt_no)
  values (v_payment_id, v_bill_no || '-R' || (v_existing_count + 1));

  return v_payment_id;
end;
$$;

grant execute on function public.record_payment(uuid, uuid, numeric, text, text, text, text, uuid) to authenticated;
grant execute on function public.record_payment(uuid, uuid, numeric, text, text, text, text, uuid) to service_role;
