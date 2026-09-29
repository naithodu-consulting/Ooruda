-- =============================================================
-- Ooruda Villa M4 — guests and identity documents
-- -------------------------------------------------------------
-- Validates 20260929194538_villa_m4_guests_ids.sql
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m4_owner', 'm4-owner@test.com');
select tests.create_supabase_user('m4_manager', 'm4-manager@test.com');
select tests.create_supabase_user('m4_other', 'm4-other@test.com');

select tests.authenticate_as_service_role();

create temp table m4 on commit drop as
  select
    (public.create_villa_account('M4 Villa', tests.get_supabase_uid('m4_owner'))).id as villa_id,
    (public.create_villa_account('M4 Other', tests.get_supabase_uid('m4_other'))).id as other_id;

create temp table m4p on commit drop as
  select public.connect_villa_property((select villa_id from m4), 'http://127.0.0.1:1',
    'pgtap-m4.invalid', 'c0000000-0000-0000-0000-00000000c4a1', 'M4', 'M4 Villa',
    'test-service-key-0123456789') as id;

create temp table m4g (id uuid) on commit drop;

set local role postgres;

grant select, insert on m4, m4p, m4g to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m4), tests.get_supabase_uid('m4_manager'), 'villa_manager');

-- ── Guests: read by members, written by the server ───────────
select tests.authenticate_as('m4_manager');

select throws_ok(
  $$ insert into public.villa_guests (account_id, full_name, phone)
     values ((select villa_id from m4), 'Direct', '+919876543210') $$,
  '42501',
  null,
  'members cannot write the guest register directly'
);

select tests.authenticate_as_service_role();

select lives_ok(
  $$ with x as (
       insert into public.villa_guests (account_id, full_name, phone)
       values ((select villa_id from m4), 'Asha Rao', '+919876543210')
       returning id
     )
     insert into m4g select id from x $$,
  'the server adds a guest'
);

select throws_ok(
  $$ insert into public.villa_guests (account_id, full_name, phone)
     values ((select villa_id from m4), 'Asha again', '+919876543210') $$,
  '23505',
  null,
  'one guest per phone number per villa'
);

select throws_ok(
  $$ insert into public.villa_guests (account_id, full_name, phone)
     values ((select villa_id from m4), 'Bad phone', '98765') $$,
  '23514',
  null,
  'phone must be E.164'
);

select lives_ok(
  $$ insert into public.villa_booking_guests
       (account_id, property_id, site_booking_id, guest_id, is_primary)
     values ((select villa_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e001', (select id from m4g), true) $$,
  'the server puts the guest on a booking'
);

select throws_ok(
  $$ insert into public.villa_booking_guests
       (account_id, property_id, site_booking_id, guest_id, is_primary)
     values ((select villa_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e001', gen_random_uuid(), true) $$,
  null,
  null,
  'a booking has one lead guest, and only real guests'
);

select tests.authenticate_as('m4_manager');

select throws_ok(
  $$ update public.villa_guests set phone = '+919000000000' $$,
  '42501',
  null,
  'members cannot rewrite a guest directly'
);

select throws_ok(
  $$ delete from public.villa_booking_guests $$,
  '42501',
  null,
  'members cannot unlink guests directly'
);

-- ── Documents: server-written only ───────────────────────────
select throws_ok(
  $$ insert into public.villa_guest_documents
       (account_id, property_id, site_booking_id, guest_id, doc_type, stage, purge_after)
     values ((select villa_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e001', (select id from m4g),
             'aadhaar', 'seen_in_person', '2030-02-01') $$,
  '42501',
  null,
  'members cannot write ID records directly'
);

select tests.authenticate_as_service_role();

select throws_ok(
  $$ insert into public.villa_guest_documents
       (account_id, property_id, site_booking_id, guest_id, doc_type, masked_number, stage, purge_after)
     values ((select villa_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e001', (select id from m4g),
             'aadhaar', '234567890123', 'seen_in_person', '2030-02-01') $$,
  '23514',
  null,
  'a full ID number can never be stored'
);

select throws_ok(
  $$ insert into public.villa_guest_documents
       (account_id, property_id, site_booking_id, guest_id, doc_type, stage, purge_after)
     values ((select villa_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e001', (select id from m4g),
             'passport', 'soft_copy', '2030-02-01') $$,
  '23514',
  null,
  'a stored copy must point at its file'
);

select lives_ok(
  $$ insert into public.villa_guest_documents
       (id, account_id, property_id, site_booking_id, guest_id, doc_type, masked_number, stage, storage_path, content_type, purge_after)
     values ('f0000000-0000-0000-0000-00000000f001', (select villa_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e001', (select id from m4g),
             'aadhaar', 'XXXX XXXX 0123', 'soft_copy', 'x/y/z/f001', 'image/jpeg', '2030-02-01') $$,
  'the server records an ID with a masked number'
);

select lives_ok(
  $$ insert into public.villa_guest_document_access (account_id, document_id, action, actor_user_id)
     values ((select villa_id from m4), 'f0000000-0000-0000-0000-00000000f001', 'viewed',
             tests.get_supabase_uid('m4_manager')) $$,
  'the server records a view'
);

select throws_ok(
  $$ delete from public.villa_guests where id = (select id from m4g) $$,
  '23503',
  null,
  'a guest with ID records cannot be deleted'
);

select throws_ok(
  $$ delete from public.villa_properties where id = (select id from m4p) $$,
  '23503',
  null,
  'a villa holding ID photos cannot be deleted (no orphaned files)'
);

-- ── Reads ────────────────────────────────────────────────────
select tests.authenticate_as('m4_manager');

select is(
  (select masked_number from public.villa_guest_documents),
  'XXXX XXXX 0123',
  'managers see the ID list with masked numbers'
);

select is_empty(
  $$ select 1 from public.villa_guest_document_access $$,
  'managers cannot read who viewed IDs'
);

select throws_ok(
  $$ update public.villa_guest_documents set purge_after = '2099-01-01' $$,
  '42501',
  null,
  'managers cannot extend how long an ID is kept'
);

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'villa-guest-docs' $$,
  'no member access to the ID files bucket'
);

select tests.authenticate_as('m4_owner');

select isnt_empty(
  $$ select 1 from public.villa_guest_document_access $$,
  'the owner sees who viewed IDs'
);

select throws_ok(
  $$ insert into public.villa_guest_document_access (account_id, document_id, action)
     values ((select villa_id from m4), 'f0000000-0000-0000-0000-00000000f001', 'viewed') $$,
  '42501',
  null,
  'nobody can forge or add view records by hand'
);

select lives_ok(
  $$ update public.villa_properties set whatsapp_number = '+919845000000'
     where id = (select id from m4p) $$,
  'the owner sets the villa WhatsApp number'
);

select is(
  (select whatsapp_number from public.villa_properties where id = (select id from m4p)),
  '+919845000000',
  'the WhatsApp number is saved'
);

select tests.authenticate_as('m4_manager');

select is_empty(
  $$ update public.villa_properties set whatsapp_number = '+919000000000'
     where id = (select id from m4p) returning 1 $$,
  'a manager cannot change the WhatsApp number'
);

select tests.authenticate_as('m4_other');

select is_empty(
  $$ select 1 from public.villa_guests $$,
  'another villa sees no guests'
);

select is_empty(
  $$ select 1 from public.villa_guest_documents $$,
  'another villa sees no IDs'
);

select throws_ok(
  $$ insert into public.villa_booking_guests
       (account_id, property_id, site_booking_id, guest_id)
     values ((select other_id from m4), (select id from m4p),
             'd0000000-0000-0000-0000-00000000e002', (select id from m4g)) $$,
  null,
  null,
  'another villa cannot link this villa''s guest or property'
);

select tests.authenticate_as_service_role();

select is(
  (select public from storage.buckets where id = 'villa-guest-docs'),
  false,
  'the ID bucket is private'
);

select * from finish();

ROLLBACK;
