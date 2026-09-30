-- =============================================================
-- Ooruda Villa M5a — payments, receipts, refunds, expenses
-- (OORUDA_VILLA_PLAN.md §5, §9, §9b)
--
--   villa_booking_payments  money received for a stay OFF the website (cash,
--                           UPI, bank, card). Each gets a receipt number from
--                           a gapless per-property, per-financial-year series
--                           allocated in the same transaction as the row.
--                           Never deleted: a mistaken entry is VOIDED (owner),
--                           keeping its number, so the series has no holes.
--   villa_refunds           money given back, as discrete rows against one
--                           payment; the total is derived, never accumulated,
--                           and can never exceed the payment.
--   villa_sequences         the counters (no direct access).
--   villa_expenses          what running the villa costs.
--
-- Amounts are rupees, numeric(12,2). Online (website) payments stay on the
-- booking site; the screens read them from there.
-- Tax invoices and credit notes wait for villa-booking TODO 8c and the CA's
-- confirmation of the GST slabs (plan §9).
-- =============================================================

-- ── 1. Sequences ──────────────────────────────────────────────
create table if not exists public.villa_sequences (
  property_id    uuid not null references public.villa_properties (id) on delete cascade,
  kind           text not null check (kind in ('receipt', 'refund')),
  -- FY end year: 2027 = FY 2026-27 (April 2026 – March 2027)
  financial_year smallint not null check (financial_year between 2020 and 2100),
  last_value     integer not null default 0 check (last_value >= 0),
  primary key (property_id, kind, financial_year)
);

alter table public.villa_sequences enable row level security;
revoke all on public.villa_sequences from anon, authenticated, service_role;
-- No policies and no grants: only the SECURITY DEFINER functions below.

-- 'YYYY-MM-DD' (India) → FY end year
create or replace function kit.villa_financial_year(p_date date)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (extract(year from p_date) + case when extract(month from p_date) >= 4 then 1 else 0 end)::smallint;
$$;

-- Next number for (property, kind, FY), e.g. 'V19/RCT/2627/0001'.
-- Runs inside the caller's transaction: a failed insert rolls the counter
-- back too, so numbers are never skipped.
create or replace function kit.villa_next_number(
  p_property_id uuid,
  p_kind        text,
  p_on          date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fy     smallint := kit.villa_financial_year(p_on);
  v_value  integer;
  v_prefix text;
begin
  insert into public.villa_sequences as s (property_id, kind, financial_year, last_value)
  values (p_property_id, p_kind, v_fy, 1)
  on conflict (property_id, kind, financial_year)
  do update set last_value = s.last_value + 1
  returning last_value into v_value;

  select coalesce(booking_code_prefix, 'VIL') into v_prefix
  from public.villa_properties where id = p_property_id;

  return format(
    '%s/%s/%s%s/%s',
    v_prefix,
    case p_kind when 'receipt' then 'RCT' else 'RFD' end,
    lpad(((v_fy - 1) % 100)::text, 2, '0'),
    lpad((v_fy % 100)::text, 2, '0'),
    lpad(v_value::text, 4, '0')
  );
end;
$$;

revoke all on function kit.villa_next_number(uuid, text, date) from public;

-- ── 2. Payments ───────────────────────────────────────────────
create table if not exists public.villa_booking_payments (
  id              uuid primary key default extensions.uuid_generate_v4(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  property_id     uuid not null references public.villa_properties (id) on delete cascade,
  site_booking_id uuid not null,
  booking_code    text check (booking_code is null or length(booking_code) <= 32),
  -- Unique within the villa's own series (two villas may share a prefix).
  receipt_no      text not null check (length(receipt_no) <= 40),
  mode            text not null check (mode in ('cash', 'upi', 'bank', 'card', 'other')),
  amount          numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  paid_on         date not null,
  reference       text check (reference is null or length(reference) <= 100),
  payer_name      text check (payer_name is null or length(payer_name) <= 120),
  note            text check (note is null or length(note) <= 500),
  -- One per submit: a retried or double-clicked submit returns the first
  -- receipt instead of issuing a second.
  request_id      uuid not null unique,
  recorded_by     uuid references auth.users (id) on delete set null,
  recorded_at     timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references auth.users (id) on delete set null,
  void_reason     text check (void_reason is null or length(btrim(void_reason)) between 3 and 300),
  constraint villa_booking_payments_receipt_key unique (property_id, receipt_no),
  constraint villa_booking_payments_void check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null)
  )
);

create index if not exists villa_booking_payments_booking_idx
  on public.villa_booking_payments (property_id, site_booking_id);
create index if not exists villa_booking_payments_account_idx
  on public.villa_booking_payments (account_id, paid_on desc);
create index if not exists villa_booking_payments_recorded_by_idx
  on public.villa_booking_payments (recorded_by);
create index if not exists villa_booking_payments_voided_by_idx
  on public.villa_booking_payments (voided_by);

create trigger villa_booking_payments_scope
  before insert or update of account_id, property_id on public.villa_booking_payments
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_booking_payments enable row level security;
revoke all on public.villa_booking_payments from anon, authenticated, service_role;
grant select on public.villa_booking_payments to authenticated;
grant select on public.villa_booking_payments to service_role;

create policy villa_booking_payments_read on public.villa_booking_payments
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 3. Refunds ────────────────────────────────────────────────
create table if not exists public.villa_refunds (
  id              uuid primary key default extensions.uuid_generate_v4(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  property_id     uuid not null references public.villa_properties (id) on delete cascade,
  site_booking_id uuid not null,
  payment_id      uuid not null references public.villa_booking_payments (id) on delete restrict,
  refund_no       text not null check (length(refund_no) <= 40),
  amount          numeric(12, 2) not null check (amount > 0),
  mode            text not null check (mode in ('cash', 'upi', 'bank', 'card', 'other')),
  refunded_on     date not null,
  reference       text check (reference is null or length(reference) <= 100),
  reason          text not null check (length(btrim(reason)) between 3 and 500),
  -- Online refunds (Razorpay API) arrive later; offline ones are processed
  -- when recorded.
  status          text not null default 'processed' check (status in ('initiated', 'processed', 'failed')),
  razorpay_refund_id text unique check (razorpay_refund_id is null or length(razorpay_refund_id) <= 64),
  request_id      uuid not null unique,
  recorded_by     uuid references auth.users (id) on delete set null,
  recorded_at     timestamptz not null default now(),
  constraint villa_refunds_refund_key unique (property_id, refund_no)
);

create index if not exists villa_refunds_payment_idx on public.villa_refunds (payment_id);
create index if not exists villa_refunds_booking_idx on public.villa_refunds (property_id, site_booking_id);
create index if not exists villa_refunds_account_idx on public.villa_refunds (account_id, refunded_on desc);
create index if not exists villa_refunds_recorded_by_idx on public.villa_refunds (recorded_by);

create trigger villa_refunds_scope
  before insert or update of account_id, property_id on public.villa_refunds
  for each row execute function kit.assert_villa_row_scope();

alter table public.villa_refunds enable row level security;
revoke all on public.villa_refunds from anon, authenticated, service_role;
grant select on public.villa_refunds to authenticated;
grant select on public.villa_refunds to service_role;

create policy villa_refunds_read on public.villa_refunds
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());

-- ── 4. Writing money: functions only ──────────────────────────
-- The server checks the booking on the booking site first (it exists, belongs
-- to this property, is live), then calls these with the member's own session,
-- so the role check below is the member's.

create or replace function public.record_villa_payment(
  p_property_id     uuid,
  p_site_booking_id uuid,
  p_mode            text,
  p_amount          numeric,
  p_paid_on         date,
  p_reference       text,
  p_payer_name      text,
  p_note            text,
  p_request_id      uuid
)
returns public.villa_booking_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_code    text;
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_row     public.villa_booking_payments;
begin
  select account_id into v_account
  from public.villa_properties where id = p_property_id;

  -- coalesce: for a non-member villa_role() is NULL, and `NULL not in (...)`
  -- is NULL, which an IF treats as false. Never let that pass.
  if v_account is null
     or coalesce(public.villa_role(v_account), '') not in ('villa_owner', 'villa_manager') then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  -- Same submit again (retry, double click): return what it created.
  select * into v_row from public.villa_booking_payments
  where request_id = p_request_id;

  if v_row.id is not null then
    if v_row.property_id <> p_property_id then
      raise exception 'You don''t have permission to do this.' using errcode = '42501';
    end if;
    return v_row;
  end if;

  -- The booking must be a live stay of this villa. The server refreshes
  -- Ooruda's copy from the booking site just before calling; the code on
  -- the receipt comes from there, never from the caller.
  select booking_code into v_code
  from public.villa_bookings_mirror
  where property_id = p_property_id
    and site_booking_id = p_site_booking_id
    and status in ('confirmed', 'completed');

  if not found then
    raise exception 'Payments can be recorded only for a confirmed stay.' using errcode = '22023';
  end if;

  if p_paid_on > v_today then
    raise exception 'A payment cannot be dated in the future.' using errcode = '22023';
  end if;

  -- A closed year's receipt series must not grow long after the fact.
  if p_paid_on < v_today - 365 then
    raise exception 'A payment can be dated at most a year back.' using errcode = '22023';
  end if;

  insert into public.villa_booking_payments (
    account_id, property_id, site_booking_id, booking_code, receipt_no,
    mode, amount, paid_on, reference, payer_name, note, request_id, recorded_by
  ) values (
    v_account, p_property_id, p_site_booking_id, v_code,
    kit.villa_next_number(p_property_id, 'receipt', p_paid_on),
    p_mode, round(p_amount, 2), p_paid_on,
    nullif(btrim(p_reference), ''), nullif(btrim(p_payer_name), ''), nullif(btrim(p_note), ''),
    p_request_id, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_villa_payment(uuid, uuid, text, numeric, date, text, text, text, uuid) from public, anon;
grant execute on function public.record_villa_payment(uuid, uuid, text, numeric, date, text, text, text, uuid) to authenticated;

-- Owner only. Keeps the receipt number (no gap), marks it void.
create or replace function public.void_villa_payment(
  p_payment_id uuid,
  p_reason     text
)
returns public.villa_booking_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.villa_booking_payments;
begin
  select * into v_row from public.villa_booking_payments
  where id = p_payment_id
  for update;

  if v_row.id is null or public.villa_role(v_row.account_id) is distinct from 'villa_owner' then
    raise exception 'Only the villa owner can void a receipt.' using errcode = '42501';
  end if;

  if v_row.voided_at is not null then
    raise exception 'This receipt is already void.' using errcode = '22023';
  end if;

  if exists (select 1 from public.villa_refunds r where r.payment_id = p_payment_id) then
    raise exception 'This payment has refunds. It cannot be voided.' using errcode = '22023';
  end if;

  update public.villa_booking_payments
  set voided_at = now(), voided_by = (select auth.uid()), void_reason = btrim(p_reason)
  where id = p_payment_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.void_villa_payment(uuid, text) from public, anon;
grant execute on function public.void_villa_payment(uuid, text) to authenticated;

-- Owner only (refund overrides stay with the owner, plan §9b). The payment
-- row is locked, so two refunds at once can never exceed it together.
create or replace function public.record_villa_refund(
  p_payment_id  uuid,
  p_amount      numeric,
  p_mode        text,
  p_refunded_on date,
  p_reference   text,
  p_reason      text,
  p_request_id  uuid
)
returns public.villa_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay       public.villa_booking_payments;
  v_refunded  numeric;
  v_row       public.villa_refunds;
begin
  select * into v_pay from public.villa_booking_payments
  where id = p_payment_id
  for update;

  if v_pay.id is null or public.villa_role(v_pay.account_id) is distinct from 'villa_owner' then
    raise exception 'Only the villa owner can record a refund.' using errcode = '42501';
  end if;

  -- Same submit again: return what it created.
  select * into v_row from public.villa_refunds where request_id = p_request_id;

  if v_row.id is not null then
    if v_row.payment_id <> p_payment_id then
      raise exception 'You don''t have permission to do this.' using errcode = '42501';
    end if;
    return v_row;
  end if;

  if v_pay.voided_at is not null then
    raise exception 'This receipt is void.' using errcode = '22023';
  end if;

  if p_refunded_on < v_pay.paid_on
     or p_refunded_on > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Pick a refund date between the payment date and today.' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_refunded
  from public.villa_refunds
  where payment_id = p_payment_id and status <> 'failed';

  if round(p_amount, 2) > v_pay.amount - v_refunded then
    raise exception 'That is more than is left to refund on this payment (₹%).',
      to_char(v_pay.amount - v_refunded, 'FM99999999990.00')
      using errcode = '22023';
  end if;

  insert into public.villa_refunds (
    account_id, property_id, site_booking_id, payment_id, refund_no,
    amount, mode, refunded_on, reference, reason, request_id, recorded_by
  ) values (
    v_pay.account_id, v_pay.property_id, v_pay.site_booking_id, v_pay.id,
    kit.villa_next_number(v_pay.property_id, 'refund', p_refunded_on),
    round(p_amount, 2), p_mode, p_refunded_on,
    nullif(btrim(p_reference), ''), btrim(p_reason), p_request_id, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_villa_refund(uuid, numeric, text, date, text, text, uuid) from public, anon;
grant execute on function public.record_villa_refund(uuid, numeric, text, date, text, text, uuid) to authenticated;

-- ── 5. Expenses ───────────────────────────────────────────────
create table if not exists public.villa_expenses (
  id           uuid primary key default extensions.uuid_generate_v4(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  property_id  uuid not null references public.villa_properties (id) on delete cascade,
  category     text not null check (category in (
                 'housekeeping', 'laundry', 'utilities', 'repairs', 'pool', 'garden',
                 'supplies', 'food', 'staff', 'commission', 'marketing', 'taxes_fees',
                 'insurance', 'other')),
  description  text not null check (length(btrim(description)) between 1 and 200),
  vendor       text check (vendor is null or length(vendor) <= 120),
  -- total paid, GST included; gst_amount is the part of it that was GST
  amount       numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  gst_amount   numeric(12, 2) not null default 0 check (gst_amount >= 0),
  mode         text not null check (mode in ('cash', 'upi', 'bank', 'card', 'other')),
  spent_on     date not null,
  invoice_no   text check (invoice_no is null or length(invoice_no) <= 60),
  notes        text check (notes is null or length(notes) <= 500),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint villa_expenses_gst check (gst_amount <= amount)
);

create index if not exists villa_expenses_account_idx
  on public.villa_expenses (account_id, spent_on desc);
create index if not exists villa_expenses_property_idx
  on public.villa_expenses (property_id, spent_on desc);
create index if not exists villa_expenses_created_by_idx
  on public.villa_expenses (created_by);

create trigger villa_expenses_scope
  before insert or update of account_id, property_id on public.villa_expenses
  for each row execute function kit.assert_villa_row_scope();

create trigger villa_expenses_updated_at
  before update on public.villa_expenses
  for each row execute function public.trigger_set_timestamps();

-- An expense stays with its villa and its author.
create or replace function kit.villa_expense_freeze()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.account_id := old.account_id;
  new.property_id := old.property_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger villa_expenses_freeze
  before update on public.villa_expenses
  for each row execute function kit.villa_expense_freeze();

alter table public.villa_expenses enable row level security;
revoke all on public.villa_expenses from anon, authenticated, service_role;
grant select, insert, update, delete on public.villa_expenses to authenticated;
grant select on public.villa_expenses to service_role;

-- Owners and managers record and correct expenses; only owners delete.
create policy villa_expenses_read on public.villa_expenses
  for select to authenticated
  using (public.villa_role(account_id) is not null or public.is_super_admin());
create policy villa_expenses_insert on public.villa_expenses
  for insert to authenticated
  with check (
    public.villa_role(account_id) in ('villa_owner', 'villa_manager')
    and created_by = (select auth.uid())
  );
create policy villa_expenses_update on public.villa_expenses
  for update to authenticated
  using (public.villa_role(account_id) in ('villa_owner', 'villa_manager'))
  with check (public.villa_role(account_id) in ('villa_owner', 'villa_manager'));
create policy villa_expenses_delete on public.villa_expenses
  for delete to authenticated
  using (public.villa_role(account_id) = 'villa_owner');
