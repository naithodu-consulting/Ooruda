-- =============================================================
-- Cash Ledger Bootstrap (dependency guard)
--
-- Creates cash_ledger and cash_ledger_payments tables before
-- any migration that references them. The canonical migration
-- (20260723000000_cash_ledger.sql) uses CREATE TABLE IF NOT EXISTS
-- so it becomes a no-op when replayed after this file.
--
-- Why this file exists: 20260723000000 was timestamped after
-- 20260717100000+ which ALTER/reference these tables. This bootstrap
-- fixes fresh `db reset` replay order without touching remote state.
-- =============================================================

create table if not exists public.cash_ledger (
  id                uuid primary key default gen_random_uuid(),
  association_id    uuid not null references public.associations(id) on delete cascade,
  unit_id           uuid not null references public.units(id) on delete cascade,
  entry_type        text not null
    check (entry_type in ('due', 'advance_payment', 'advance_applied', 'due_payment')),
  bill_type         text not null,
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
