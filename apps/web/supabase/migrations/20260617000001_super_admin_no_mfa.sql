-- =============================================================
-- Super Admin without MFA (PropOps is phone-OTP only)
-- -------------------------------------------------------------
-- MakerKit's stock public.is_super_admin() requires aal2 (TOTP MFA)
-- in addition to app_metadata.role = 'super-admin'. PropOps authenticates
-- exclusively via phone OTP (no password, no TOTP enrolment in Phase 1),
-- so sessions are aal1 and the stock check can never pass — the platform
-- operator could never reach /admin.
--
-- We override the function to drop ONLY the MFA requirement while keeping
-- the role check intact. Both the /admin middleware and AdminGuard defer to
-- this single RPC, so this is the only change needed.
--
-- Phase 2: when TOTP MFA is introduced for the platform operator, restore
-- the is_aal2() guard here.
-- =============================================================

create or replace function public.is_super_admin()
  returns boolean
  set search_path = ''
as
$$
declare
  is_super_admin boolean;
begin
  select (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'super-admin'
  into is_super_admin;

  return coalesce(is_super_admin, false);
end
$$ language plpgsql;

grant execute on function public.is_super_admin() to authenticated;
