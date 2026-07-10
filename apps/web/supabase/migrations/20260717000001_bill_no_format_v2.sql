-- =============================================================
-- Bill number format v2
--
-- New format:  {INITIALS}/{FY}/{TYPE}/{NNNNNN}
--   e.g.  PRM/26-27/MNT/000001  (maintenance)
--         PRM/26-27/ELT/000001  (electricity)
--         PRM/26-27/OTH/000001  (other charges)
--
-- INITIALS = first letter of each word in the association's account
--            name, up to 3 words, uppercased.
-- FY       = Indian financial year (Apr–Mar), formatted as "YY-YY"
--            e.g. FY 2026-27 → "26-27"
-- TYPE     = MNT | ELT | OTH | SNK | DGU
-- NNNNNN   = 6-digit zero-padded per-(association, type, FY) counter
--
-- Existing bills keep their old format; only new allocations use v2.
-- Old bill_sequences rows (MANT/ELEC/OTHR) remain valid for
-- historical reference — the expanded check constraint allows both.
-- =============================================================

-- ─── 1. EXPAND CHECK CONSTRAINT ──────────────────────────────
alter table public.bill_sequences
  drop constraint bill_sequences_bill_type_check;

alter table public.bill_sequences
  add constraint bill_sequences_bill_type_check
  check (bill_type in ('MANT', 'ELEC', 'OTHR', 'MNT', 'ELT', 'OTH', 'SNK', 'DGU'));


-- ─── 2. REPLACE allocate_bill_no ─────────────────────────────
create or replace function public.allocate_bill_no(
  p_association_id uuid,
  p_bill_type      text,   -- 'MNT' | 'ELT' | 'OTH' | 'SNK' | 'DGU'
  p_period         text    -- 'YYYY-MM'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year        int;
  v_month       int;
  v_fy          smallint;
  v_seq         int;
  v_fy_str      text;
  v_pfx         text;
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
  insert into public.bill_sequences (association_id, bill_type, financial_year, next_val)
  values (p_association_id, p_bill_type, v_fy, 1)
  on conflict (association_id, bill_type, financial_year)
  do update set next_val = public.bill_sequences.next_val + 1
  returning next_val into v_seq;

  -- Build prefix: first letter of each word in accounts.name, up to 3 words, uppercased.
  -- e.g. "Prashanth Residency Manor" → "PRM"
  select upper(
    (select string_agg(left(word, 1), '' order by idx)
     from unnest(string_to_array(trim(acc.name), ' ')) with ordinality as t(word, idx)
     where idx <= 3 and length(trim(word)) > 0)
  )
  into v_pfx
  from public.accounts acc
  join public.associations assoc on assoc.account_id = acc.id
  where assoc.id = p_association_id;

  -- FY display string: end-year 2027 → "26-27"
  v_fy_str :=
    lpad(((v_fy - 1) % 100)::text, 2, '0') || '-' ||
    lpad((v_fy      % 100)::text, 2, '0');

  return v_pfx || '/' || v_fy_str || '/' || p_bill_type || '/' || lpad(v_seq::text, 6, '0');
end;
$$;

grant execute on function public.allocate_bill_no(uuid, text, text) to authenticated;
