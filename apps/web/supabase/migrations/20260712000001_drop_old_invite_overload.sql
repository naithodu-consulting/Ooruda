-- =============================================================
-- Drop the old 4-arg overload of invite_to_association_by_phone.
-- The 6-arg version (with default p_name / p_email) was added in
-- 20260630000000_invite_name_email.sql via CREATE OR REPLACE but
-- with a different signature — PostgreSQL treats that as a NEW
-- overload rather than a replacement. PostgREST returns HTTP 300
-- (ambiguous) whenever both overloads are present and the caller
-- passes all 6 arguments. Dropping the stale 4-arg overload
-- resolves the ambiguity.
-- =============================================================

drop function if exists public.invite_to_association_by_phone(
  text,    -- account_slug
  text,    -- p_phone
  varchar, -- p_role
  uuid     -- invited_by
);
