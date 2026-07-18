-- =============================================================
-- Cash Ledger
--
-- Per-unit credit/debit ledger for advance payments and standalone
-- dues. Advance payments are auto-applied during bill generation;
-- dues appear in the payments view as a separate payable section.
-- =============================================================

-- ── 1. cash_ledger ──────────────────────────────────────────
create table if not exists public.cash_ledger (
  id                uuid primary key default gen_random_uuid(),
  association_id    uuid not null references public.associations(id) on delete cascade,
  unit_id           uuid not null references public.units(id) on delete cascade,
  entry_type        text not null
    check (entry_type in ('due', 'advance_payment', 'advance_applied', 'due_payment')),
  bill_type         text not null,
  -- 'due'              → debit  (money owed before system setup)
  -- 'advance_payment'  → credit (customer paid ahead)
  -- 'advance_applied'  → debit  (advance consumed by bill generation)
  -- 'due_payment'      → credit (cash payment against a due)
  amount            numeric(12, 2) not null check (amount > 0),
  direction         text not null check (direction in ('debit', 'credit')),
  reference_bill_id uuid references public.bills(id) on delete set null,
  paid_by_user_id   uuid references auth.users(id) on delete set null,
  paid_by_name      text not null default '',
  entry_date        date not null default current_date,
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists cash_ledger_unit_type   on public.cash_ledger (unit_id, bill_type);
create index if not exists cash_ledger_association  on public.cash_ledger (association_id);

alter table public.cash_ledger enable row level security;

revoke all on public.cash_ledger from authenticated, service_role;
grant select, insert, update, delete on public.cash_ledger to authenticated;

create policy "cash_ledger_read" on public.cash_ledger
  for select to authenticated
  using (public.is_association_member(association_id));

create policy "cash_ledger_insert" on public.cash_ledger
  for insert to authenticated
  with check (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );

create policy "cash_ledger_delete" on public.cash_ledger
  for delete to authenticated
  using (public.association_role(association_id) = 'assoc_admin');

-- ── 2. cash_ledger_payments ──────────────────────────────────
-- Records cash/UPI/etc. payments made against a negative ledger
-- balance (standalone dues). Separate from bill payments.
create table if not exists public.cash_ledger_payments (
  id              uuid primary key default gen_random_uuid(),
  association_id  uuid not null references public.associations(id) on delete cascade,
  unit_id         uuid not null references public.units(id) on delete cascade,
  bill_type       text not null,
  amount          numeric(12, 2) not null check (amount > 0),
  mode            text not null
    check (mode in ('Cash', 'Bank Transfer', 'UPI', 'Cheque')),
  reference_no    text,
  receipt_no      text,
  receipt_pdf_url text,
  paid_at         timestamptz not null default now(),
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists clp_association on public.cash_ledger_payments (association_id);
create index if not exists clp_unit_type   on public.cash_ledger_payments (unit_id, bill_type);

alter table public.cash_ledger_payments enable row level security;

revoke all on public.cash_ledger_payments from authenticated, service_role;
grant select, insert on public.cash_ledger_payments to authenticated;

create policy "clp_read" on public.cash_ledger_payments
  for select to authenticated
  using (public.is_association_member(association_id));

create policy "clp_insert" on public.cash_ledger_payments
  for insert to authenticated
  with check (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );

-- ── 3. bills.advance_applied ─────────────────────────────────
alter table public.bills
  add column if not exists advance_applied numeric(12, 2) not null default 0;

comment on column public.bills.advance_applied is
  'Amount auto-applied from the unit cash ledger at bill generation time. Reduces net payable but is not counted in paid_amount (which tracks actual cash payments only).';

-- ── 4. get_cash_ledger_balance RPC ───────────────────────────
-- Returns net balance for a unit+bill_type:
--   positive → credit (advance available)
--   negative → debit  (dues outstanding)
--   zero     → settled
create or replace function public.get_cash_ledger_balance(
  p_unit_id   uuid,
  p_bill_type text
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(case when direction = 'credit' then amount else -amount end),
    0
  )
  from public.cash_ledger
  where unit_id   = p_unit_id
    and bill_type = p_bill_type;
$$;

grant execute on function public.get_cash_ledger_balance(uuid, text) to authenticated;

-- ── 5. get_association_cash_ledger_balances RPC ──────────────
-- Returns all (unit_id, bill_type, balance) rows for an association
-- that have a non-zero balance. Used by the payments page dues section.
create or replace function public.get_association_cash_ledger_balances(
  p_association_id uuid
)
returns table(unit_id uuid, unit_no text, bill_type text, balance numeric)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

grant execute on function public.get_association_cash_ledger_balances(uuid) to authenticated;
