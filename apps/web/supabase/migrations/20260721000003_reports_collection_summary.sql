-- Aggregated collection summary for the Reports screen.
-- Returns one row per (period, bill_type) so the app never has to fetch
-- all bill rows and aggregate in JS — avoids a full table scan at scale.

create or replace function public.get_collection_summary(
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
      b.period,
      coalesce(b.bill_type, 'maintenance') as bill_type,
      count(*)::bigint                      as bill_count,
      sum(b.total_amount)                   as billed,
      sum(b.paid_amount)                    as collected
    from public.bills b
    where
      b.association_id = p_association_id
      and (p_from_period is null or b.period >= p_from_period)
      and (p_to_period   is null or b.period <= p_to_period)
    group by b.period, b.bill_type
    order by b.period desc, b.bill_type;
end;
$$;

grant execute on function public.get_collection_summary(uuid, text, text) to authenticated;
