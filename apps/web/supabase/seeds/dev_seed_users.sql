-- =============================================================
-- PropOps Dev Seed — 5 test users with different roles
-- =============================================================
-- RUN IN: Supabase Dashboard → SQL Editor  (NOT as a migration)
-- REQUIRES: The PropOps roles migration must be applied first.
--
-- Test phone numbers and their roles:
--   +919911000001  assoc_admin      (can do everything)
--   +919911000002  billing_operator (billing, payments, reports)
--   +919911000003  prop_owner       (Unit Owner A — reports only)
--   +919911000004  prop_owner       (Unit Owner B — reports only)
--   +919911000005  tenant           (read-only via RLS)
--
-- After running this, add these phones as Supabase "Test phone
-- numbers" in Dashboard → Auth → Providers → Phone, each with
-- OTP code 123456, so you can sign in without a real SMS.
-- =============================================================

do $$
declare
  v_account_id  uuid;
  v_user_id     uuid;

  -- Static UUIDs so re-runs are idempotent
  u_admin    constant uuid := 'a0000001-0000-0000-0000-000000000001';
  u_billing  constant uuid := 'a0000001-0000-0000-0000-000000000002';
  u_owner_a  constant uuid := 'a0000001-0000-0000-0000-000000000003';
  u_owner_b  constant uuid := 'a0000001-0000-0000-0000-000000000004';
  u_tenant   constant uuid := 'a0000001-0000-0000-0000-000000000005';

  type_phone constant jsonb :=
    '{"provider":"phone","providers":["phone"]}'::jsonb;
begin
  -- ── Create test users in auth.users ──────────────────────────
  -- on_auth_user_created trigger auto-creates their personal accounts.
  insert into auth.users (
    id, aud, role, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_super_admin, is_anonymous
  ) values
    (u_admin,   'authenticated', 'authenticated',
     '+919911000001', now(), type_phone,
     '{"full_name":"Dev Admin"}',          now(), now(), false, false),

    (u_billing, 'authenticated', 'authenticated',
     '+919911000002', now(), type_phone,
     '{"full_name":"Dev Billing Operator"}', now(), now(), false, false),

    (u_owner_a, 'authenticated', 'authenticated',
     '+919911000003', now(), type_phone,
     '{"full_name":"Dev Owner A"}',        now(), now(), false, false),

    (u_owner_b, 'authenticated', 'authenticated',
     '+919911000004', now(), type_phone,
     '{"full_name":"Dev Owner B"}',        now(), now(), false, false),

    (u_tenant,  'authenticated', 'authenticated',
     '+919911000005', now(), type_phone,
     '{"full_name":"Dev Tenant"}',         now(), now(), false, false)
  on conflict (id) do nothing;

  -- ── Find the first team account (the test association) ───────
  select id into v_account_id
  from   public.accounts
  where  is_personal_account = false
  order  by created_at asc
  limit  1;

  if v_account_id is null then
    raise exception
      'No association found. Sign in, create an association, then re-run this seed.';
  end if;

  -- ── Assign roles in that association ─────────────────────────
  insert into public.accounts_memberships (user_id, account_id, account_role)
  values
    (u_admin,   v_account_id, 'assoc_admin'),
    (u_billing, v_account_id, 'billing_operator'),
    (u_owner_a, v_account_id, 'prop_owner'),
    (u_owner_b, v_account_id, 'prop_owner'),
    (u_tenant,  v_account_id, 'tenant')
  on conflict (user_id, account_id)
    do update set account_role = excluded.account_role;

  raise notice 'Seeded 5 test users into association %', v_account_id;
end;
$$;
