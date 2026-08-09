-- Store the active tenancy at payment time on cash_ledger_payments so
-- receipt PDFs can always attribute the correct historical tenant,
-- even after tenant turnover on the unit.

-- ── 1. Add tenancy_id column ────────────────────────────────────────────────

alter table public.cash_ledger_payments
  add column if not exists tenancy_id uuid references public.tenancies(id) on delete set null;

-- ── 2. Replace record_due_payment to capture tenancy_id at payment time ─────
--
-- When paid_by_role = 'Tenant', the RPC looks up the currently active tenancy
-- and stores its ID. This snapshot survives tenant changes, giving PDF generation
-- a reliable historical reference (mirrors how bills.tenancy_id works).

drop function if exists public.record_due_payment(uuid, uuid, text, numeric, text, text, text);

create function public.record_due_payment(
  p_association_id uuid,
  p_unit_id        uuid,
  p_bill_type      text,
  p_amount         numeric,
  p_mode           text,
  p_reference_no   text default null,
  p_paid_by_role   text default 'Owner'
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
  v_tenancy_id  uuid;
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

  if p_paid_by_role not in ('Owner', 'Tenant') then
    raise exception 'paid_by_role must be Owner or Tenant.';
  end if;

  -- Snapshot the active tenancy at payment time when paid as Tenant.
  if p_paid_by_role = 'Tenant' then
    select id into v_tenancy_id
    from public.tenancies
    where unit_id = p_unit_id
      and status = 'active'
    order by start_date desc
    limit 1;
  end if;

  v_receipt_no := public._allocate_ledger_doc_no(p_association_id, p_bill_type, current_date, 'CL');

  insert into public.cash_ledger_payments
    (association_id, unit_id, bill_type, amount, mode,
     reference_no, receipt_no, recorded_by, paid_by_role, tenancy_id)
  values
    (p_association_id, p_unit_id, p_bill_type, p_amount, p_mode,
     p_reference_no, v_receipt_no, auth.uid(), p_paid_by_role, v_tenancy_id)
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
  on function public.record_due_payment(uuid, uuid, text, numeric, text, text, text)
  to authenticated;
