-- =============================================================
-- Billing PDF download — unit-level access scoping
-- -------------------------------------------------------------
-- bills/payments RLS only checks association membership
-- (is_association_member), not which unit a row belongs to. The PDF
-- download route additionally restricts owners/tenants to units they
-- actually own or rent (see canAccessUnit in
-- apps/web/.../billing/_lib/server/pdf-generation.ts). This test proves
-- the underlying data-access boundary that function relies on:
--   * a tenant on unit A can find their own unit via owner_id/tenancies
--   * a tenant on unit A does NOT show up as owner/tenant of unit B,
--     even though both units are in the same association and bills/
--     payments RLS alone would let them SELECT unit B's bill row.
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

set local role postgres;

select tests.create_supabase_user('pdf_admin');
select tests.create_supabase_user('pdf_tenant_a');
select tests.create_supabase_user('pdf_tenant_b');

set local role service_role;
select public.create_team_account('PDF Test Co', tests.get_supabase_uid('pdf_admin'), 'pdf-test-co');

set local role postgres;
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (makerkit.get_account_id_by_slug('pdf-test-co'), tests.get_supabase_uid('pdf_tenant_a'), 'tenant'),
  (makerkit.get_account_id_by_slug('pdf-test-co'), tests.get_supabase_uid('pdf_tenant_b'), 'tenant');

-- Two units in the SAME association
insert into public.units (id, association_id, unit_no, area_sqft, status)
values
  ('11111111-1111-1111-1111-111111111111',
   (select id from public.associations where account_id = makerkit.get_account_id_by_slug('pdf-test-co')),
   'A-101', 500, 'Occupied'),
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.associations where account_id = makerkit.get_account_id_by_slug('pdf-test-co')),
   'B-202', 500, 'Occupied');

insert into public.tenancies (unit_id, tenant_id, start_date, status) values
  ('11111111-1111-1111-1111-111111111111', tests.get_supabase_uid('pdf_tenant_a'), '2026-01-01', 'active'),
  ('22222222-2222-2222-2222-222222222222', tests.get_supabase_uid('pdf_tenant_b'), '2026-01-01', 'active');

-- Two bills, one per unit
insert into public.bills (id, association_id, unit_id, period, bill_no, total_amount, due_date)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   (select id from public.associations where account_id = makerkit.get_account_id_by_slug('pdf-test-co')),
   '11111111-1111-1111-1111-111111111111', '2026-06', 'BILL-A-001', 1000, '2026-06-10'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from public.associations where account_id = makerkit.get_account_id_by_slug('pdf-test-co')),
   '22222222-2222-2222-2222-222222222222', '2026-06', 'BILL-B-001', 1000, '2026-06-10');

select makerkit.authenticate_as('pdf_tenant_a');

-- 1. Confirm bills RLS alone (association-wide) WOULD let tenant_a read bill B —
--    this is the gap canAccessUnit exists to close at the app layer.
select isnt_empty(
  $$ select 1 from public.bills where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'RLS alone (is_association_member) lets tenant_a SELECT unit B''s bill row — confirms unit scoping must happen in the app layer, not RLS'
);

-- 2. Tenant A IS the owner/tenant of unit A (the canAccessUnit check would pass)
select isnt_empty(
  $$ select 1 from public.tenancies
     where unit_id = '11111111-1111-1111-1111-111111111111'
       and tenant_id = auth.uid() $$,
  'tenant_a has a tenancy on unit A — canAccessUnit allows their own bill'
);

-- 3. Tenant A is NOT the owner/tenant of unit B (the canAccessUnit check would fail)
select is_empty(
  $$ select 1 from public.units
     where id = '22222222-2222-2222-2222-222222222222' and owner_id = auth.uid() $$,
  'tenant_a does not own unit B'
);
select is_empty(
  $$ select 1 from public.tenancies
     where unit_id = '22222222-2222-2222-2222-222222222222' and tenant_id = auth.uid() $$,
  'tenant_a has no tenancy on unit B — canAccessUnit blocks bill B, route returns 404'
);

select * from finish();
ROLLBACK;
