-- Cash Ledger Bill Numbering
--
-- Replaces opaque identifiers like "CL-MAIN-A1B2C3-R1" and "ADV-MAIN-A1B2C3-A1"
-- with the exact same format used for regular bills:
--
--   Due payment receipt:   PRM/26-27/MNT/000001
--   Advance application:   PRM/26-27/MNT/000001
--
-- Format: {INITIALS}/{FY}/{TYPE}/{NNNNNN}  — identical to allocate_bill_no output.
--   INITIALS  = first letter of each word in the association name (up to 3)
--   FY        = Indian financial year end, e.g. "26-27" for Apr 2026 – Mar 2027
--   TYPE      = MNT | ELT | OTH | SNK | DGU
--   NNNNNN    = 6-digit zero-padded per-(association, type, FY, prefix) counter
--
-- CL and ADV documents draw from separate counters in cash_ledger_sequences
-- (distinct from bill_sequences) so bill numbering is unaffected.
-- The document type (dues receipt vs advance voucher) is identified by the
-- PDF title and content — not the number itself.
--
-- Note: when used in URL path segments the "/" must be percent-encoded (%2F).
-- The statement-table already uses encodeURIComponent() for this purpose.

-- ── 1. Sequence table ─────────────────────────────────────────────────────────

create table if not exists public.cash_ledger_sequences (
  association_id uuid     not null references public.associations(id) on delete cascade,
  bill_type      text     not null,
  financial_year smallint not null,
  prefix         text     not null check (prefix in ('CL', 'ADV')),
  next_val       integer  not null default 1,
  primary key (association_id, bill_type, financial_year, prefix)
);

-- Only accessed by SECURITY DEFINER functions below — no direct client access.
revoke all on public.cash_ledger_sequences from authenticated, anon, service_role;

-- ── 2. Helper: _allocate_ledger_doc_no ───────────────────────────────────────
-- Called only from SECURITY DEFINER functions that have already validated auth.
-- No caller-role check here; the callers are responsible for authorization.

create or replace function public._allocate_ledger_doc_no(
  p_association_id uuid,
  p_bill_type      text,
  p_date           date,
  p_prefix         text   -- 'CL' or 'ADV'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year   int;
  v_month  int;
  v_fy     smallint;
  v_fy_str text;
  v_initials text;
  v_seq    int;
begin
  v_year  := extract(year  from p_date)::int;
  v_month := extract(month from p_date)::int;

  -- Indian financial year: April 1 is the first day of a new FY.
  -- v_fy holds the *end* year, e.g. FY 2026-27 → v_fy = 2027.
  v_fy := case when v_month >= 4 then (v_year + 1)::smallint else v_year::smallint end;

  -- Atomically increment the counter for this (association, type, FY, prefix).
  insert into public.cash_ledger_sequences
    (association_id, bill_type, financial_year, prefix, next_val)
  values
    (p_association_id, p_bill_type, v_fy, p_prefix, 1)
  on conflict (association_id, bill_type, financial_year, prefix)
  do update set next_val = public.cash_ledger_sequences.next_val + 1
  returning next_val into v_seq;

  -- Build association initials: first letter of each word (up to 3), uppercased.
  -- e.g. "Prashanth Residency Manor" → "PRM"
  select upper(
    (select string_agg(left(word, 1), '' order by idx)
     from unnest(string_to_array(trim(acc.name), ' ')) with ordinality as t(word, idx)
     where idx <= 3 and length(trim(word)) > 0)
  )
  into v_initials
  from public.accounts acc
  join public.associations assoc on assoc.account_id = acc.id
  where assoc.id = p_association_id;

  -- Guard: if the association name is missing/empty, fall back to "UNK"
  -- so the document number is never NULL (which would silently swallow the record).
  if v_initials is null or v_initials = '' then
    v_initials := 'UNK';
  end if;

  -- FY display string: end-year 2027 → "26-27"
  v_fy_str :=
    lpad(((v_fy - 1) % 100)::text, 2, '0') || '-' ||
    lpad((v_fy      % 100)::text, 2, '0');

  -- PRM/26-27/MNT/000001  (same format as regular bills; document type from PDF content)
  return v_initials || '/' || v_fy_str || '/' || p_bill_type || '/' || lpad(v_seq::text, 6, '0');
end;
$$;

-- No direct grant — this function is called only by other SECURITY DEFINER functions.


-- ── 3. Update record_due_payment ─────────────────────────────────────────────

create or replace function public.record_due_payment(
  p_association_id uuid,
  p_unit_id        uuid,
  p_bill_type      text,
  p_amount         numeric,
  p_mode           text,
  p_reference_no   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id  uuid;
  v_caller_role text;
  v_receipt_no  text;
begin
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  v_receipt_no := public._allocate_ledger_doc_no(p_association_id, p_bill_type, current_date, 'CL');

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     reference_no, receipt_no, recorded_by)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount, p_mode,
     p_reference_no, v_receipt_no, auth.uid())
  returning id into v_payment_id;

  insert into public.cash_ledger
    (association_id, unit_id, entry_type, bill_type, amount, direction,
     paid_by_name, entry_date, notes)
  values
    (p_association_id, p_unit_id, 'due_payment', p_bill_type, p_amount, 'credit',
     'Cash payment', current_date,
     'Payment via ' || p_mode ||
       coalesce(' · Ref: ' || p_reference_no, '') ||
       ' · Receipt: ' || v_receipt_no);

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text)
  to authenticated;


-- ── 4. Update record_due_payment_webhook ─────────────────────────────────────

create or replace function public.record_due_payment_webhook(
  p_association_id      uuid,
  p_unit_id             uuid,
  p_bill_type           text,
  p_amount              numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_receipt_no text;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  v_receipt_no := public._allocate_ledger_doc_no(p_association_id, p_bill_type, current_date, 'CL');

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     razorpay_payment_id, receipt_no)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount,
     'Razorpay', p_razorpay_payment_id, v_receipt_no)
  returning id into v_payment_id;

  insert into public.cash_ledger
    (association_id, unit_id, entry_type, bill_type, amount, direction,
     paid_by_name, entry_date, notes)
  values
    (p_association_id, p_unit_id, 'due_payment', p_bill_type, p_amount, 'credit',
     'Online payment', current_date,
     'Online payment via Razorpay (ref: ' || p_razorpay_payment_id ||
       ') · Receipt: ' || v_receipt_no);

  return v_payment_id;
end;
$$;

grant execute
  on function public.record_due_payment_webhook(uuid, uuid, text, numeric, text)
  to service_role;


-- ── 5. Update _apply_advance_internal ────────────────────────────────────────

create or replace function public._apply_advance_internal(
  p_association_id uuid,
  p_unit_id        uuid,
  p_bill_type      text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance        numeric;
  v_bill           record;
  v_bill_due       numeric;
  v_apply          numeric;
  v_total_applied  numeric := 0;
  v_ledger_id      uuid;
  v_voucher_no     text;
begin
  -- Live advance balance for this unit + bill_type (credits - debits).
  select coalesce(
    sum(case when direction = 'credit' then amount else -amount end), 0
  )
    into v_balance
  from public.cash_ledger
  where unit_id   = p_unit_id
    and bill_type = p_bill_type;

  if v_balance <= 0 then
    return 0;
  end if;

  -- Outstanding bills of this unit + bill_type, oldest-first.
  for v_bill in
    select id, bill_no, period, total_amount,
           coalesce(paid_amount, 0)     as paid_amount,
           coalesce(advance_applied, 0) as advance_applied
    from public.bills
    where association_id = p_association_id
      and unit_id        = p_unit_id
      and bill_type      = p_bill_type
      and status in ('Unpaid', 'Partial', 'Overdue')
    order by due_date asc nulls last, generated_at asc
  loop
    exit when v_balance <= 0;

    v_bill_due := v_bill.total_amount - v_bill.paid_amount - v_bill.advance_applied;
    if v_bill_due <= 0 then
      continue;
    end if;

    v_apply := least(v_balance, v_bill_due);

    -- Generate voucher number for this advance application.
    v_voucher_no := public._allocate_ledger_doc_no(p_association_id, p_bill_type, current_date, 'ADV');

    -- Consume the advance with a ledger debit tied to the bill.
    insert into public.cash_ledger
      (association_id, unit_id, entry_type, bill_type, amount, direction,
       reference_bill_id, paid_by_name, entry_date, notes)
    values
      (p_association_id, p_unit_id, 'advance_applied', p_bill_type, v_apply, 'debit',
       v_bill.id, 'Auto-applied', current_date,
       'Applied to bill ' || v_bill.bill_no || ' · Voucher: ' || v_voucher_no)
    returning id into v_ledger_id;

    -- Record the application receipt.
    insert into public.advance_application_receipts
      (association_id, unit_id, cash_ledger_id, bill_id,
       bill_type, amount, voucher_no, applied_at)
    values
      (p_association_id, p_unit_id, v_ledger_id, v_bill.id,
       p_bill_type, v_apply, v_voucher_no, now());

    -- Update the bill: bump advance_applied, derive status.
    update public.bills
    set advance_applied = v_bill.advance_applied + v_apply,
        status = case
          when v_bill.paid_amount + v_bill.advance_applied + v_apply >= total_amount
            then 'Paid'
          else 'Partial'
        end
    where id = v_bill.id;

    v_balance       := v_balance - v_apply;
    v_total_applied := v_total_applied + v_apply;
  end loop;

  return v_total_applied;
end;
$$;

revoke all on function public._apply_advance_internal(uuid, uuid, text)
  from authenticated, anon;
