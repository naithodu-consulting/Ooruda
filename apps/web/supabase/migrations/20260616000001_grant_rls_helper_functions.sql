-- =============================================================
-- Grant EXECUTE on RLS helper functions to `authenticated`.
-- These SECURITY DEFINER functions are called from RLS policy
-- USING/WITH CHECK clauses; without EXECUTE granted, Postgres
-- raises "permission denied for function" when the policy runs,
-- which PostgREST surfaces as a 403 on every read/write of
-- associations / billing_settings / charge_types / units / etc.
-- (REVOKE EXECUTE FROM PUBLIC is a Supabase default hardening,
-- so newly created functions are private until explicitly granted.)
-- =============================================================

grant execute on function public.is_association_member(uuid) to authenticated;
grant execute on function public.association_role(uuid) to authenticated;
