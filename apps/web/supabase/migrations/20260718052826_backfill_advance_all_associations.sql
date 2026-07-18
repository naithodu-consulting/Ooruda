-- =============================================================
-- Full backfill: apply stranded advances across ALL associations
--
-- Follow-up to 20260718050936, whose backfill was intentionally scoped
-- to sandbox-residency-test for safe verification. This applies the same
-- retroactive advance-to-bill logic to every remaining association.
--
-- Idempotent: _apply_advance_internal consumes advance balance via
-- advance_applied ledger debits, so associations already backfilled
-- (e.g. sandbox-residency-test) have no positive balance left to apply
-- and are effectively skipped.
-- =============================================================

do $$
declare
  r record;
begin
  for r in
    select cl.association_id, cl.unit_id, cl.bill_type
    from public.cash_ledger cl
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
