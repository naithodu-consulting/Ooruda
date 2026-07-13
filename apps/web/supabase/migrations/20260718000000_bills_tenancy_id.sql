-- =============================================================
-- Attribute bills to the tenancy that was active when they were
-- generated.
--
-- Bug: bills/payments carried no reference to which tenancy period
-- they belonged to — only unit_id. When a unit changed tenants, the
-- new tenant's bill/payment list (and PDF authorization) was scoped
-- purely by unit_id, so they could see every historical bill on that
-- unit, including the previous tenant's amounts, payment modes,
-- and receipt numbers.
--
-- Fix: add bills.tenancy_id (nullable — null for bills generated
-- during a self-occupied period with no tenant). Backfill existing
-- rows by matching each bill's period against the tenancy that
-- covered that period on the same unit. Application code then scopes
-- a tenant's own bill/payment views and PDF downloads to their own
-- tenancy_id (or null, i.e. pre-tenancy bills, which were never
-- addressed to any tenant anyway).
-- =============================================================

alter table public.bills
  add column if not exists tenancy_id uuid references public.tenancies(id) on delete set null;

create index if not exists bills_tenancy_id on public.bills (tenancy_id);

comment on column public.bills.tenancy_id is
  'Tenancy that was active on this unit when the bill was generated. Null means no tenancy was active (self-occupied) at that time.';

-- Backfill: attribute each existing bill to whichever tenancy on the
-- same unit overlaps the bill's period (period is 'YYYY-MM'; treat it
-- as covering the whole calendar month).
update public.bills b
   set tenancy_id = t.id
  from public.tenancies t
 where t.unit_id = b.unit_id
   and b.tenancy_id is null
   and (b.period || '-01')::date >= date_trunc('month', t.start_date)
   and (b.period || '-01')::date < coalesce(t.end_date + 1, 'infinity'::date);

-- Update create_bill_with_items to accept and store p_tenancy_id.
-- Replaces the previous 9-arg version (p_bill_type + p_gst_amount).
create or replace function public.create_bill_with_items(
  p_association_id uuid,
  p_unit_id        uuid,
  p_period         text,
  p_bill_no        text,
  p_due_date       date,
  p_total_amount   numeric,
  p_line_items     jsonb,
  p_bill_type      varchar(20) default 'maintenance',
  p_gst_amount     numeric(12, 2) default null,
  p_tenancy_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id     uuid;
  v_caller_role text;
begin
  -- Authorization: must be admin or billing operator.
  select am.account_role into v_caller_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('assoc_admin', 'billing_operator') then
    raise exception 'Only an association admin or billing operator can do that.';
  end if;

  insert into public.bills
    (association_id, unit_id, period, bill_no, bill_type, total_amount, gst_amount, due_date, generated_by, tenancy_id)
  values
    (p_association_id, p_unit_id, p_period, p_bill_no, p_bill_type, p_total_amount, p_gst_amount, p_due_date, auth.uid(), p_tenancy_id)
  returning id into v_bill_id;

  insert into public.bill_line_items (bill_id, charge_type_id, description, payer, gst_applicable, amount)
  select
    v_bill_id,
    (item->>'charge_type_id')::uuid,
    (item->>'description')::text,
    (item->>'payer')::text,
    (item->>'gst_applicable')::boolean,
    (item->>'amount')::numeric
  from jsonb_array_elements(p_line_items) as item;

  return v_bill_id;
end;
$$;

grant execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric, uuid)
  to authenticated;

-- Revoke the previous 9-arg overload (no tenancy_id) so no stale
-- client build can create a bill without tenancy attribution.
revoke execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric)
  from authenticated;
