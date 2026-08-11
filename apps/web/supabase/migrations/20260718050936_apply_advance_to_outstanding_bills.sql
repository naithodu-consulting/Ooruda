-- =============================================================
-- Retroactive advance application
--
-- Problem: advances were only ever applied to a bill at generation
-- time (inside create_bill_with_items). An advance deposited AFTER a
-- bill was generated sat idle as credit while the bill stayed
-- Unpaid/Overdue — e.g. a unit with a large advance still dunned for
-- its outstanding bills.
--
-- Fix: apply available advance to a unit's outstanding bills of the
-- same bill_type, oldest-first, whenever an advance is deposited.
-- Mirrors the generation-time logic (advance_applied debit in
-- cash_ledger + bill.advance_applied / status update). Includes a
-- one-time backfill for already-stranded advances.
-- =============================================================

-- ── Internal worker (no auth guard; DB-internal + backfill use) ──
-- SECURITY DEFINER. NOT granted to authenticated — reachable only via
-- the guarded wrapper below or from other SECURITY DEFINER code.
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
  v_balance       numeric;
  v_bill          record;
  v_bill_due      numeric;
  v_apply         numeric;
  v_total_applied numeric := 0;
begin
  -- Live advance balance for this unit + bill_type (credits - debits).
  select coalesce(
    sum(case when direction = 'credit' then amount else -amount end), 0
  )
    into v_balance
  from public.cash_ledger
  where unit_id = p_unit_id
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
      and bill_type       = p_bill_type
      and status in ('Unpaid', 'Partial', 'Overdue')
    order by due_date asc nulls last, generated_at asc
  loop
    exit when v_balance <= 0;

    v_bill_due := v_bill.total_amount - v_bill.paid_amount - v_bill.advance_applied;
    if v_bill_due <= 0 then
      continue;
    end if;

    v_apply := least(v_balance, v_bill_due);

    -- Consume the advance with a ledger debit tied to the bill.
    insert into public.cash_ledger
      (association_id, unit_id, entry_type, bill_type, amount, direction,
       reference_bill_id, paid_by_name, entry_date, notes)
    values
      (p_association_id, p_unit_id, 'advance_applied', p_bill_type, v_apply, 'debit',
       v_bill.id, 'Auto-applied', current_date,
       'Auto-applied to bill ' || v_bill.bill_no || ' for ' || v_bill.period);

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

-- ── Guarded wrapper (callable by admin / billing operator) ───────
create or replace function public.apply_available_advance(
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
  v_caller_role text;
begin
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null
     or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  return public._apply_advance_internal(p_association_id, p_unit_id, p_bill_type);
end;
$$;

grant execute on function public.apply_available_advance(uuid, uuid, text)
  to authenticated;

-- ── Scoped backfill: sandbox-residency-test association only ─────
-- Deliberately limited to the test association for safe verification on the
-- shared/remote DB. The full all-association backfill runs in a follow-up
-- migration once this is confirmed working.
do $$
declare
  v_assoc_id uuid;
  r record;
begin
  select a.id into v_assoc_id
  from public.associations a
  join public.accounts acc on acc.id = a.account_id
  where acc.slug = 'sandbox-residency-test'
  limit 1;

  if v_assoc_id is null then
    raise notice 'sandbox-residency-test association not found; skipping backfill.';
    return;
  end if;

  for r in
    select cl.association_id, cl.unit_id, cl.bill_type
    from public.cash_ledger cl
    where cl.association_id = v_assoc_id
    group by cl.association_id, cl.unit_id, cl.bill_type
    having coalesce(
      sum(case when cl.direction = 'credit' then cl.amount else -cl.amount end), 0
    ) > 0
  loop
    perform public._apply_advance_internal(
      r.association_id, r.unit_id, r.bill_type
    );
  end loop;
end;
$$;
