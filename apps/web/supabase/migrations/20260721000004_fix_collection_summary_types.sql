-- Recreate get_collection_summary with explicit ::text casts so the return
-- types exactly match the RETURNS TABLE declaration regardless of the
-- underlying varchar column types on bills.period and bills.bill_type.
-- This also resolves a "structure of query does not match function result type"
-- plan-cache issue caused by later schema changes to the bills table.

drop function if exists public.get_collection_summary(uuid, text, text);

create function public.get_collection_summary(
  p_association_id uuid,
  p_from_period    text default null,  -- YYYY-MM inclusive, null = no lower bound
  p_to_period      text default null   -- YYYY-MM inclusive, null = no upper bound
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
    group by b.period, b.bill_type
    order by b.period desc, b.bill_type;
end;
$$;

grant execute on function public.get_collection_summary(uuid, text, text) to authenticated;
