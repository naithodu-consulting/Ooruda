-- =============================================================
-- Add gst_amount column to bills and update create_bill_with_items
-- to accept and store it.
--
-- gst_amount stores the total GST (CGST + SGST) computed at bill
-- generation time. It is null for non-GST associations or bills
-- generated before this migration. total_amount is updated to be
-- GST-inclusive when gst_amount is provided.
-- =============================================================

alter table public.bills
  add column if not exists gst_amount numeric(12, 2) default null;

comment on column public.bills.gst_amount is
  'Total GST amount (CGST + SGST) included in total_amount. Null means no GST applied.';

-- Update create_bill_with_items to accept p_gst_amount.
-- Replaces the previous 8-arg version.
create or replace function public.create_bill_with_items(
  p_association_id uuid,
  p_unit_id        uuid,
  p_period         text,
  p_bill_no        text,
  p_due_date       date,
  p_total_amount   numeric,
  p_line_items     jsonb,
  p_bill_type      varchar(20) default 'maintenance',
  p_gst_amount     numeric(12, 2) default null
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
    (association_id, unit_id, period, bill_no, bill_type, total_amount, gst_amount, due_date, generated_by)
  values
    (p_association_id, p_unit_id, p_period, p_bill_no, p_bill_type, p_total_amount, p_gst_amount, p_due_date, auth.uid())
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

-- Grant all three signatures (7-arg, 8-arg, 9-arg) so in-flight callers
-- don't break during deployment.
grant execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb)
  to authenticated;

grant execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric)
  to authenticated;
