-- =============================================================
-- Track the area/rate used to compute a per-sqft line item, so it can
-- be shown on the bill PDF (Area, Rate columns) and stays correct for
-- historical bills even after an association later switches its
-- maintenance charge type from per-sqft to per-unit/flat billing.
--
-- Both columns are nullable and only populated for line items whose
-- charge type was calc_method = 'per_sqft' at generation time; flat
-- and per-unit line items leave them null, which is also what a
-- fully per-unit/flat association's bills will always have.
-- =============================================================

alter table public.bill_line_items
  add column if not exists area_sqft numeric(10, 2),
  add column if not exists rate_per_sqft numeric(12, 4);

comment on column public.bill_line_items.area_sqft is
  'Unit area (sq ft) used to compute this line item, when its charge type is per-sqft. Null otherwise.';
comment on column public.bill_line_items.rate_per_sqft is
  'Rate per sq ft used to compute this line item, when its charge type is per-sqft. Null otherwise.';

-- Update create_bill_with_items so each line item in p_line_items may
-- carry optional area_sqft/rate_per_sqft (absent/null for non-per-sqft
-- items, matching the existing pattern for other optional fields).
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

  insert into public.bill_line_items
    (bill_id, charge_type_id, description, payer, gst_applicable, amount, area_sqft, rate_per_sqft)
  select
    v_bill_id,
    (item->>'charge_type_id')::uuid,
    (item->>'description')::text,
    (item->>'payer')::text,
    (item->>'gst_applicable')::boolean,
    (item->>'amount')::numeric,
    (item->>'area_sqft')::numeric,
    (item->>'rate_per_sqft')::numeric
  from jsonb_array_elements(p_line_items) as item;

  return v_bill_id;
end;
$$;

grant execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric, uuid)
  to authenticated;
