-- Unit Dues report: aggregate outstanding per unit in the database.
--
-- The Reports tab previously pulled EVERY bill and EVERY payment for the
-- association to the browser and reduced them in JS, purely to derive one
-- outstanding total and one last-payment date per unit. That payload grows
-- without bound as payment history accumulates.
--
-- SECURITY INVOKER (the default) is deliberate: the function must stay subject
-- to the caller's RLS policies, exactly like the client-side queries it
-- replaces. It grants no new visibility.

create or replace function public.get_unit_outstanding_summary(
  p_association_id uuid
)
returns table (
  unit_id uuid,
  unit_no text,
  total_outstanding numeric,
  overdue_count bigint,
  last_payment_date date,
  owner_name text,
  owner_phone text
)
language sql
stable
as $$
  with bill_outstanding as (
    select
      b.unit_id,
      -- Settled = payments + advance credit applied. Forgetting advance_applied
      -- is the classic "Paid but ₹X outstanding" bug.
      greatest(
        0,
        b.total_amount
          - coalesce(b.paid_amount, 0)
          - coalesce(b.advance_applied, 0)
      ) as outstanding,
      b.due_date
    from public.bills b
    where b.association_id = p_association_id
      and b.status not in ('Reversed', 'Void')
  ),
  per_unit as (
    select
      bo.unit_id,
      sum(bo.outstanding) as total_outstanding,
      count(*) filter (
        where bo.outstanding > 0
          -- Overdue is evaluated in the billing timezone, not the server's UTC
          -- date, so a bill does not flip a day early for IST users.
          and bo.due_date < (now() at time zone 'Asia/Kolkata')::date
      ) as overdue_count
    from bill_outstanding bo
    group by bo.unit_id
  ),
  last_payment as (
    select
      b.unit_id,
      max((p.paid_at at time zone 'Asia/Kolkata')::date) as last_payment_date
    from public.payments p
    join public.bills b on b.id = p.bill_id
    where b.association_id = p_association_id
    group by b.unit_id
  ),
  occupant as (
    -- Current occupant contact, taken from the active tenancy. One active
    -- tenancy per unit is enforced by a unique index, so this cannot fan out.
    select
      t.unit_id,
      pr.full_name,
      pr.mobile_number
    from public.tenancies t
    left join public.profiles pr on pr.id = t.tenant_id
    where t.end_date is null
      and t.status = 'active'
  )
  select
    pu.unit_id,
    u.unit_no,
    pu.total_outstanding,
    pu.overdue_count,
    lp.last_payment_date,
    o.full_name as owner_name,
    o.mobile_number as owner_phone
  from per_unit pu
  join public.units u on u.id = pu.unit_id
  left join last_payment lp on lp.unit_id = pu.unit_id
  left join occupant o on o.unit_id = pu.unit_id
  where pu.total_outstanding > 0
  order by pu.total_outstanding desc;
$$;

comment on function public.get_unit_outstanding_summary(uuid) is
  'Per-unit outstanding totals, overdue counts, last payment date and current occupant contact for the Unit Dues report. RLS-enforced (security invoker).';

revoke all on function public.get_unit_outstanding_summary(uuid) from public;
grant execute on function public.get_unit_outstanding_summary(uuid) to authenticated;
