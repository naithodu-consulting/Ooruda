-- Extend get_collection_summary to support unit_ids and bill_types filters.
-- Previously the function ignored these dimensions, causing Reports to show
-- association-wide totals even when unit or type filters were applied.

drop function if exists public.get_collection_summary(uuid, text, text);

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
      sum(b.paid_amount)::numeric                 as collected
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
