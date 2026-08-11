-- Count advance credit as collected in the Reports collection summary.
--
-- A bill can be settled two ways: by a payment row (bills.paid_amount) or from
-- the unit's advance balance (bills.advance_applied). The summary only summed
-- paid_amount, so a bill fully settled from advance was reported as billed but
-- never collected — understating collection and overstating outstanding.

drop function if exists public.get_collection_summary(uuid, text, text, uuid[], text[]);

create function public.get_collection_summary(
  p_association_id uuid,
  p_from_period    text    default null,  -- YYYY-MM inclusive, null = no lower bound
  p_to_period      text    default null,  -- YYYY-MM inclusive, null = no upper bound
  p_unit_ids       uuid[]  default null,  -- null = all units
  p_bill_types     text[]  default null   -- null = all bill types
)
returns table (
  period      text,
  bill_type   text,
  bill_count  bigint,
  billed      numeric,
  collected   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_association_member(p_association_id) then
    raise exception 'Not authorized';
  end if;

  return query
    select
      b.period::text,
      coalesce(b.bill_type, 'maintenance')::text as bill_type,
      count(*)::bigint                            as bill_count,
      sum(b.total_amount)::numeric                as billed,
      -- Settled = payments + advance credit applied to the bill. Capped at the
      -- bill total so an over-application can never report collection > billed.
      sum(
        least(
          coalesce(b.paid_amount, 0) + coalesce(b.advance_applied, 0),
          b.total_amount
        )
      )::numeric                                  as collected
    from public.bills b
    where
      b.association_id = p_association_id
      and (p_from_period is null or b.period::text >= p_from_period)
      and (p_to_period   is null or b.period::text <= p_to_period)
      and (p_unit_ids    is null or b.unit_id = any(p_unit_ids))
      and (p_bill_types  is null or b.bill_type = any(p_bill_types))
    group by b.period, b.bill_type
    order by b.period desc, b.bill_type;
end;
$$;

grant execute on function public.get_collection_summary(uuid, text, text, uuid[], text[]) to authenticated;
