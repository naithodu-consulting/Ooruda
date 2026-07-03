-- ─── 1. PER-ASSOCIATION PAYMENT GATEWAYS ────────────────────────────────────
-- Stores Razorpay (and future gateway) credentials per association.
-- Intentionally has NO authenticated RLS policy — only the service_role
-- (admin client) may read/write this table. Credentials never reach the client.

create table if not exists public.association_payment_gateways (
  id               uuid primary key default gen_random_uuid(),
  association_id   uuid unique not null references public.associations(id) on delete cascade,
  provider         varchar(50) not null default 'razorpay',
  key_id           varchar(255) not null,
  key_secret       varchar(255) not null,
  webhook_secret   varchar(255),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.association_payment_gateways enable row level security;

-- No authenticated policies — admin client (service_role) only.
revoke all on public.association_payment_gateways from authenticated;
grant select, insert, update, delete on public.association_payment_gateways to service_role;

-- ─── 2. PAYMENTS TABLE ADDITIONS ─────────────────────────────────────────────
-- razorpay_order_id: the order created before checkout opens.
-- payment_batch_id:  groups multiple payment rows from one Razorpay transaction
--                    (used when owner pays all pending bills in a single checkout).

alter table public.payments
  add column if not exists razorpay_order_id text,
  add column if not exists payment_batch_id  uuid;

-- The existing unique constraint on razorpay_payment_id is too strict: for
-- "Pay All" a single Razorpay payment_id covers multiple bills (one payment
-- row each). Replace with a composite unique index instead.
alter table public.payments
  drop constraint if exists payments_razorpay_payment_id_key;

create unique index if not exists payments_razorpay_bill_uniq
  on public.payments (razorpay_payment_id, bill_id)
  where razorpay_payment_id is not null;

-- Index for batch grouping queries.
create index if not exists payments_payment_batch_id_idx
  on public.payments (payment_batch_id)
  where payment_batch_id is not null;

-- ─── 3. UPDATED record_payment() RPC ─────────────────────────────────────────
-- Extends the existing RPC with three optional Razorpay fields and relaxes the
-- role check so that prop_owner / tenant can record their own Razorpay payments
-- (the server-side signature verification in the API route is the real guard).

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
  -- 1. Authorization: resolve the caller's role in this association.
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
    p_association_id, p_bill_id, p_amount, p_mode, p_paid_by_role, auth.uid(),
    p_razorpay_payment_id, p_razorpay_order_id, p_payment_batch_id
  )
  returning id into v_payment_id;

  -- 6. Insert receipt.
  insert into public.receipts (payment_id, receipt_no)
  values (v_payment_id, v_bill_no || '-R' || (v_existing_count + 1));

  return v_payment_id;
end;
$$;

-- Grant both old 5-arg and new 8-arg signatures.
grant execute on function public.record_payment(uuid, uuid, numeric, text, text)                              to authenticated;
grant execute on function public.record_payment(uuid, uuid, numeric, text, text, text, text, uuid)           to authenticated;
