-- Advance Application Receipts
--
-- Adds a receipts table for advance-applied transactions and updates
-- _apply_advance_internal to generate a voucher number, insert a receipt
-- record, and embed the voucher number in cash_ledger.notes so the
-- Statement page can surface it without a cross-table join.

-- ── New table ─────────────────────────────────────────────────────────────────

create table if not exists public.advance_application_receipts (
  id               uuid unique not null default extensions.uuid_generate_v4(),
  association_id   uuid not null references public.associations(id) on delete cascade,
  unit_id          uuid not null references public.units(id) on delete cascade,
  cash_ledger_id   uuid not null references public.cash_ledger(id) on delete cascade,
  bill_id          uuid references public.bills(id) on delete set null,
  bill_type        text not null,
  amount           numeric(12, 2) not null check (amount > 0),
  voucher_no       text not null unique,
  pdf_url          text,
  applied_at       timestamp with time zone not null default now(),
  created_at       timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.advance_application_receipts enable row level security;

revoke all on public.advance_application_receipts from authenticated, anon, service_role;
grant select on public.advance_application_receipts to authenticated;

-- Any member of the association may SELECT (unit-level scoping enforced at
-- the app layer in the PDF route handler via canAccessUnit).
create policy "advance_application_receipts_select" on public.advance_application_receipts
  for select to authenticated
  using (public.is_association_member(association_id));

-- ── Update _apply_advance_internal ────────────────────────────────────────────
-- Now generates a voucher_no (ADV-{TYPE4}-{UNIT6}-A{seq}), inserts into
-- advance_application_receipts, and embeds the voucher_no in cash_ledger.notes.

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
  v_seq            bigint;
  v_voucher_no     text;
begin
  -- Live advance balance for this unit + bill_type (credits - debits).
  select coalesce(
    sum(case when direction = 'credit' then amount else -amount end), 0
  )
    into v_balance
  from public.cash_ledger
  where unit_id  = p_unit_id
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

    -- Generate a sequential voucher number for this application.
    select count(*) + 1 into v_seq
    from public.advance_application_receipts
    where association_id = p_association_id
      and unit_id        = p_unit_id
      and bill_type      = p_bill_type;

    v_voucher_no := 'ADV-' || upper(left(p_bill_type, 4)) || '-' ||
                    upper(left(p_unit_id::text, 6))        || '-A' ||
                    v_seq::text;

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
