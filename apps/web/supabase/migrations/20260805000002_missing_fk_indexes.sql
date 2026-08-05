-- @DISABLE_DDL_TRANSACTION
-- =============================================================
-- Missing FK Indexes + Aggregation RPC — 2026-08-05
-- =============================================================
-- Full audit identified 8 FK columns with no supporting index,
-- causing sequential scans on every query and RLS evaluation.
-- All indexes use CONCURRENTLY to avoid write-blocking on live data.
-- CONCURRENTLY cannot run inside a transaction — hence @DISABLE_DDL_TRANSACTION.
-- =============================================================

-- ── 1. sub_meters.unit_id ────────────────────────────────────
-- Electricity page: .in('unit_id', unitIds) → seq scan.
-- RLS policy: EXISTS (SELECT 1 FROM units WHERE id = unit_id) → seq scan per row.
create index concurrently if not exists sub_meters_unit_id
  on public.sub_meters (unit_id);

-- ── 2. meter_readings.mescom_bill_id ─────────────────────────
-- Joins from mescom_bills → meter_readings use this FK.
-- Existing (sub_meter_id, period) composite does not cover mescom_bill_id.
create index concurrently if not exists meter_readings_mescom_bill_id
  on public.meter_readings (mescom_bill_id);

-- ── 3. tenancies.tenant_id ───────────────────────────────────
-- Statement page, payments page, statement PDF all query by tenant_id.
-- Only the partial unique index on unit_id (where end_date is null) exists.
create index concurrently if not exists tenancies_tenant_id
  on public.tenancies (tenant_id);

-- ── 4. payments.association_id ───────────────────────────────
-- Payments/billing admin pages filter by association_id.
-- The existing payments_bill index covers bill_id only.
-- RLS policy evaluates is_association_member(association_id) per row.
create index concurrently if not exists payments_association_id
  on public.payments (association_id);

-- ── 5. pending_other_charges.association_id + unit_id ────────
-- Both columns are used in WHERE clauses and RLS policies with no index.
create index concurrently if not exists pending_other_charges_association_id
  on public.pending_other_charges (association_id);

create index concurrently if not exists pending_other_charges_unit_id
  on public.pending_other_charges (unit_id);

-- ── 6. bill_line_items.charge_type_id ────────────────────────
-- Reports screen joins bill_line_items → charge_types for per-type aggregates.
create index concurrently if not exists bill_line_items_charge_type_id
  on public.bill_line_items (charge_type_id);

-- ── 7. audit_logs.actor_user_id ──────────────────────────────
-- Audit page resolves actor profiles via this column.
-- Existing (association_id, created_at DESC) composite does not cover actor_user_id.
create index concurrently if not exists audit_logs_actor_user_id
  on public.audit_logs (actor_user_id);

-- ── 8. Trigram indexes for ilike '%…%' searches ──────────────
-- profiles.full_name and audit_logs.action use leading-wildcard ilike,
-- which btree indexes cannot satisfy. GIN trigram indexes enable fast
-- substring and prefix searching.
create extension if not exists pg_trgm;

create index concurrently if not exists profiles_full_name_trgm
  on public.profiles using gin (full_name gin_trgm_ops);

create index concurrently if not exists audit_logs_action_trgm
  on public.audit_logs using gin (action gin_trgm_ops);

-- ── 9. get_unit_ledger_balances RPC ─────────────────────────────────────────
-- Replaces client-side aggregation in loadUnitLedgerBalances().
-- Previously: all cash_ledger rows for the given units were fetched into
-- Node.js memory and summed in JavaScript. This performs the aggregation
-- entirely in Postgres, returning one row per (unit_id, bill_type) instead
-- of potentially thousands of raw rows.
create or replace function public.get_unit_ledger_balances(
  p_association_id uuid,
  p_unit_ids       uuid[]
)
returns table (
  unit_id   uuid,
  bill_type text,
  net       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    cl.unit_id,
    cl.bill_type,
    sum(case when cl.direction = 'credit' then cl.amount else -cl.amount end) as net
  from public.cash_ledger cl
  where cl.association_id = p_association_id
    and cl.unit_id = any(p_unit_ids)
  group by cl.unit_id, cl.bill_type
  having sum(case when cl.direction = 'credit' then cl.amount else -cl.amount end) <> 0;
$$;

grant execute on function public.get_unit_ledger_balances(uuid, uuid[])
  to authenticated, service_role;
