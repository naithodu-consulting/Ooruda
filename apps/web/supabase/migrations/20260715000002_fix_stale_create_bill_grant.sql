-- =============================================================
-- Fix stale GRANT in 20260702000001_bills_gst_amount.sql
--
-- That migration pre-emptively issued a GRANT EXECUTE on the 8-arg
-- create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar)
-- overload, which did not exist at the time it ran during a fresh local
-- `db reset`.  Postgres raises an error on GRANT EXECUTE for a
-- non-existent function, breaking local resets from scratch.
--
-- The 8-arg overload is a transitional signature created later in
-- 20260712000004.  The 9-arg overload (with p_gst_amount) is the one
-- currently called by billing-actions.ts and is the canonical version.
--
-- Fix: use a DO block to revoke the grant gracefully (no-op when the
-- function doesn't exist), ensuring a clean slate on local resets.
-- =============================================================

do $$
begin
  -- Revoke the 8-arg grant that was issued before the overload existed.
  -- On a fresh local reset this function won't exist yet, so we catch
  -- the undefined_function exception and silently continue.
  execute 'revoke execute on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar(20)) from authenticated';
exception when undefined_function or undefined_object then
  null;
end;
$$;

-- Ensure the 9-arg signature (p_gst_amount variant, the one actually
-- called by billing-actions.ts) always has execute permission.
grant execute
  on function public.create_bill_with_items(uuid, uuid, text, text, date, numeric, jsonb, varchar, numeric)
  to authenticated;
