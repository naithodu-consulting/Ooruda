-- =============================================================
-- Bill Sequences — FY-scoped, per-type atomic counters
--
-- Replaces the app-layer sequence scan (which reset every billing
-- period) with a DB-level counter scoped to (association, bill_type,
-- financial_year). This gives accounts a continuous, unbroken series
-- within each financial year (April – March) — which is the expected
-- format for Indian GST return filing.
--
-- Three independent series per association per FY:
--   MANT  — maintenance bills
--   ELEC  — electricity bills
--   OTHR  — other-charges bills
--
-- New bill number format:  {Prefix}-{Type}-{FYSTR}-{NNNN}
--   e.g.  OOR1A2B-MANT-2627-0001  (FY 2026-27, first maintenance bill)
--         OOR1A2B-ELEC-2627-0001  (FY 2026-27, first electricity bill)
-- =============================================================

-- ─── 1. SEQUENCES TABLE ──────────────────────────────────────
create table public.bill_sequences (
  association_id uuid     not null references public.associations(id) on delete cascade,
  bill_type      text     not null check (bill_type in ('MANT', 'ELEC', 'OTHR')),
  -- FY end year: 2027 represents FY 2026-27 (April 2026 – March 2027)
  financial_year smallint not null,
  -- Stores the last sequence number issued; starts at 1 on first use.
  next_val       integer  not null default 1 check (next_val >= 1),
  primary key (association_id, bill_type, financial_year)
);

alter table public.bill_sequences enable row level security;
-- No direct-access policies: only the SECURITY DEFINER function below
-- can read or write this table.


-- ─── 2. ATOMIC ALLOCATION FUNCTION ──────────────────────────
-- Returns a fully-formatted bill number like 'OOR1A2B-MANT-2627-0001'.
-- Uses INSERT … ON CONFLICT DO UPDATE to atomically increment the
-- counter, eliminating the race condition in the old app-layer scan.
create or replace function public.allocate_bill_no(
  p_association_id uuid,
  p_bill_type      text,   -- 'MANT' | 'ELEC' | 'OTHR'
  p_period         text    -- 'YYYY-MM'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year      int;
  v_month     int;
  v_fy        smallint;
  v_seq       int;
  v_fy_str    text;
  v_pfx       text;
  v_caller_role text;
begin
  -- Authorization: caller must be admin or billing operator
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can allocate bill numbers.';
  end if;

  -- Derive financial year from billing period (India: April = FY start)
  v_year  := split_part(p_period, '-', 1)::int;
  v_month := split_part(p_period, '-', 2)::int;

  if v_month >= 4 then
    v_fy := (v_year + 1)::smallint;   -- e.g. 2026-06 → FY end = 2027
  else
    v_fy := v_year::smallint;          -- e.g. 2027-01 → FY end = 2027
  end if;

  -- Atomically issue the next sequence number for this (association, type, FY).
  -- INSERT on first use; UPDATE (increment) on every subsequent call.
  insert into public.bill_sequences (association_id, bill_type, financial_year, next_val)
  values (p_association_id, p_bill_type, v_fy, 1)
  on conflict (association_id, bill_type, financial_year)
  do update set next_val = public.bill_sequences.next_val + 1
  returning next_val into v_seq;

  -- Build association prefix: slug[0:3] + assoc_uuid[0:4] (uppercased)
  select upper(substring(a.slug, 1, 3)) || upper(substring(p_association_id::text, 1, 4))
  into v_pfx
  from public.associations assoc
  join public.accounts a on a.id = assoc.account_id
  where assoc.id = p_association_id;

  -- FY display string: end-year 2027 → '2627', 2028 → '2728', etc.
  v_fy_str :=
    lpad(((v_fy - 1) % 100)::text, 2, '0') ||
    lpad((v_fy      % 100)::text, 2, '0');

  return v_pfx || '-' || p_bill_type || '-' || v_fy_str || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

grant execute on function public.allocate_bill_no(uuid, text, text) to authenticated;
