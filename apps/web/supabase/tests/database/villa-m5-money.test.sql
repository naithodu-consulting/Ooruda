-- =============================================================
-- Ooruda Villa M5a — payments, receipts, refunds, expenses
-- -------------------------------------------------------------
-- Validates 20260930003722_villa_m5_payments_expenses.sql
--
-- Run: pnpm --filter web supabase:test   (requires local Supabase)
-- =============================================================
BEGIN;

select no_plan();

select tests.create_supabase_user('m5_owner', 'm5-owner@test.com');
select tests.create_supabase_user('m5_manager', 'm5-manager@test.com');
select tests.create_supabase_user('m5_other', 'm5-other@test.com');

select tests.authenticate_as_service_role();

create temp table m5 on commit drop as
  select
    (public.create_villa_account('M5 Villa', tests.get_supabase_uid('m5_owner'))).id as villa_id,
    (public.create_villa_account('M5 Other', tests.get_supabase_uid('m5_other'))).id as other_id;

create temp table m5p on commit drop as
  select public.connect_villa_property((select villa_id from m5), 'http://127.0.0.1:1',
    'pgtap-m5.invalid', 'c0000000-0000-0000-0000-00000000c5a1', 'M5', 'M5 Villa',
    'test-service-key-0123456789') as id;

create temp table m5pay (id uuid, receipt_no text) on commit drop;

insert into public.villa_bookings_mirror
  (property_id, site_booking_id, account_id, site_property_id, booking_code, reference_number,
   status, payment_status, check_in, check_out, nights, adults, children, infants,
   base_amount, extra_guest_amount, tax_amount, total_amount, guest_name)
values
  ((select id from m5p), 'd0000000-0000-0000-0000-00000000a001', (select villa_id from m5),
   'c0000000-0000-0000-0000-00000000c5a1', 'M5-AAA-BBB', 'REF-A', 'confirmed', 'unpaid',
   '2026-10-10', '2026-10-12', 2, 4, 0, 0, 20000, 0, 3600, 23600, 'Asha'),
  ((select id from m5p), 'd0000000-0000-0000-0000-00000000a002', (select villa_id from m5),
   'c0000000-0000-0000-0000-00000000c5a1', null, 'REF-B', 'pending', 'unpaid',
   '2026-10-20', '2026-10-21', 1, 2, 0, 0, 10000, 0, 1800, 11800, 'Hold');

set local role postgres;

grant select, insert on m5, m5p, m5pay to authenticated;

insert into public.accounts_memberships (account_id, user_id, account_role)
values ((select villa_id from m5), tests.get_supabase_uid('m5_manager'), 'villa_manager');

-- ── Payments and receipt numbers ─────────────────────────────
select tests.authenticate_as('m5_manager');

select lives_ok(
  $$ insert into m5pay
     select id, receipt_no from public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'upi', 10000, '2026-06-10', 'UTR123', 'Asha', null, gen_random_uuid()) $$,
  'a manager records a payment'
);

select is(
  (select receipt_no from m5pay limit 1),
  'M5/RCT/2627/0001',
  'receipt numbers follow the financial year: prefix/RCT/2627/0001'
);

select lives_ok(
  $$ insert into m5pay
     select id, receipt_no from public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'cash', 5000, '2026-06-11', null, null, null, gen_random_uuid()) $$,
  'a second payment'
);

select is(
  (select receipt_no from m5pay where receipt_no like '%0002'),
  'M5/RCT/2627/0002',
  'numbers are consecutive, no gaps'
);

select lives_ok(
  $$ insert into m5pay
     select id, receipt_no from public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'bank', 100, '2026-03-31', null, null, null, gen_random_uuid()) $$,
  'a payment in the previous financial year'
);

select is(
  (select receipt_no from m5pay where receipt_no like '%/2526/%'),
  'M5/RCT/2526/0001',
  '31 March belongs to the old year, which has its own series'
);

select throws_ok(
  $$ select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'upi', 100, '2099-01-01', null, null, null, gen_random_uuid()) $$,
  '22023',
  null,
  'no payments dated in the future'
);

select throws_ok(
  $$ select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'upi', -5, '2026-06-10', null, null, null, gen_random_uuid()) $$,
  '23514',
  null,
  'amounts must be positive'
);

select throws_ok(
  $$ insert into public.villa_booking_payments
       (account_id, property_id, site_booking_id, receipt_no, mode, amount, paid_on)
     values ((select villa_id from m5), (select id from m5p),
             'd0000000-0000-0000-0000-00000000a001', 'FAKE/1', 'cash', 1, '2026-06-10') $$,
  '42501',
  null,
  'no one writes the ledger directly (receipt numbers only from the function)'
);

-- ── Refunds and voids: owner only ────────────────────────────
select throws_ok(
  $$ select public.record_villa_refund(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0001'),
       1000, 'upi', '2026-06-12', null, 'Guest cancelled', gen_random_uuid()) $$,
  '42501',
  null,
  'a manager cannot refund'
);

select throws_ok(
  $$ select public.void_villa_payment(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0001'), 'Typed twice') $$,
  '42501',
  null,
  'a manager cannot void a receipt'
);

select tests.authenticate_as('m5_owner');

select is(
  (select refund_no from public.record_villa_refund(
     (select id from m5pay where receipt_no = 'M5/RCT/2627/0001'),
     6000, 'upi', '2026-06-12', 'RFD-UTR', 'Guest cancelled', gen_random_uuid())),
  'M5/RFD/2627/0001',
  'the owner refunds part of a payment, with its own number series'
);

select throws_ok(
  $$ select public.record_villa_refund(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0001'),
       4000.01, 'upi', '2026-06-12', null, 'More', gen_random_uuid()) $$,
  '22023',
  null,
  'refunds can never exceed the payment in total'
);

select lives_ok(
  $$ select public.record_villa_refund(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0001'),
       4000, 'upi', '2026-06-12', null, 'The rest', gen_random_uuid()) $$,
  'refunding exactly the remainder is allowed'
);

select throws_ok(
  $$ select public.record_villa_refund(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0002'),
       100, 'cash', '2026-06-01', null, 'Too early', gen_random_uuid()) $$,
  '22023',
  null,
  'a refund cannot predate its payment'
);

select throws_ok(
  $$ select public.void_villa_payment(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0001'), 'Mistake') $$,
  '22023',
  null,
  'a refunded payment cannot be voided'
);

select lives_ok(
  $$ select public.void_villa_payment(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0002'), 'Entered twice') $$,
  'the owner voids a mistaken receipt'
);

select is(
  (select count(*)::int from public.villa_booking_payments where receipt_no = 'M5/RCT/2627/0002'),
  1,
  'a void keeps the receipt (and its number) in the series'
);

select throws_ok(
  $$ select public.record_villa_refund(
       (select id from m5pay where receipt_no = 'M5/RCT/2627/0002'),
       100, 'cash', '2026-06-12', null, 'After void', gen_random_uuid()) $$,
  '22023',
  null,
  'nothing is refunded against a void receipt'
);

select throws_ok(
  $$ delete from public.villa_booking_payments $$,
  '42501',
  null,
  'receipts are never deleted'
);

-- ── Other villas ─────────────────────────────────────────────
select tests.authenticate_as('m5_other');

select throws_ok(
  $$ select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'cash', 1, '2026-06-10', null, null, null, gen_random_uuid()) $$,
  '42501',
  null,
  'another villa cannot record payments here'
);

select is_empty(
  $$ select 1 from public.villa_booking_payments $$,
  'another villa sees no payments'
);

select is_empty(
  $$ select 1 from public.villa_refunds $$,
  'another villa sees no refunds'
);

select throws_ok(
  $$ select * from public.villa_sequences $$,
  '42501',
  null,
  'the counters are not readable'
);

-- ── Expenses ─────────────────────────────────────────────────
select tests.authenticate_as('m5_manager');

select lives_ok(
  $$ insert into public.villa_expenses
       (account_id, property_id, category, description, amount, gst_amount, mode, spent_on, created_by)
     values ((select villa_id from m5), (select id from m5p), 'pool', 'Chlorine',
             1180, 180, 'upi', '2026-06-10', tests.get_supabase_uid('m5_manager')) $$,
  'a manager records an expense'
);

select throws_ok(
  $$ insert into public.villa_expenses
       (account_id, property_id, category, description, amount, gst_amount, mode, spent_on, created_by)
     values ((select villa_id from m5), (select id from m5p), 'pool', 'Bad GST',
             100, 200, 'upi', '2026-06-10', tests.get_supabase_uid('m5_manager')) $$,
  '23514',
  null,
  'GST cannot exceed the amount'
);

select throws_ok(
  $$ insert into public.villa_expenses
       (account_id, property_id, category, description, amount, mode, spent_on, created_by)
     values ((select villa_id from m5), (select id from m5p), 'pool', 'As someone else',
             100, 'upi', '2026-06-10', tests.get_supabase_uid('m5_owner')) $$,
  '42501',
  null,
  'an expense is recorded under your own name'
);

select is_empty(
  $$ delete from public.villa_expenses returning 1 $$,
  'only the owner deletes expenses'
);

select tests.authenticate_as('m5_owner');

select isnt_empty(
  $$ delete from public.villa_expenses returning 1 $$,
  'the owner deletes an expense'
);

select tests.authenticate_as('m5_other');

select throws_ok(
  $$ insert into public.villa_expenses
       (account_id, property_id, category, description, amount, mode, spent_on, created_by)
     values ((select villa_id from m5), (select id from m5p), 'pool', 'Intruder',
             100, 'upi', '2026-06-10', tests.get_supabase_uid('m5_other')) $$,
  '42501',
  null,
  'another villa cannot add expenses here'
);

-- ── Booking checks, idempotency, dates ───────────────────────
select tests.authenticate_as('m5_manager');

select throws_ok(
  $$ select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a002',
       'cash', 100, '2026-06-10', null, null, null, gen_random_uuid()) $$,
  '22023',
  null,
  'no receipts for a booking that is not a confirmed stay'
);

select throws_ok(
  $$ select public.record_villa_payment(
       (select id from m5p), gen_random_uuid(),
       'cash', 100, '2026-06-10', null, null, null, gen_random_uuid()) $$,
  '22023',
  null,
  'no receipts for an unknown booking id'
);

select is(
  (select booking_code from public.villa_booking_payments where receipt_no = 'M5/RCT/2627/0001'),
  'M5-AAA-BBB',
  'the booking code on a receipt comes from the booking, not the caller'
);

select is(
  (select count(*)::int from (
     select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'cash', 50, '2026-06-10', null, null, null, 'e0000000-0000-0000-0000-0000000000e1')
     union all
     select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'cash', 50, '2026-06-10', null, null, null, 'e0000000-0000-0000-0000-0000000000e1')
   ) x),
  2,
  'the same submit twice returns twice...'
);

select is(
  (select count(*)::int from public.villa_booking_payments
    where request_id = 'e0000000-0000-0000-0000-0000000000e1'),
  1,
  '...but issues only one receipt'
);

select throws_ok(
  $$ select public.record_villa_payment(
       (select id from m5p), 'd0000000-0000-0000-0000-00000000a001',
       'cash', 100, ((now() at time zone 'Asia/Kolkata')::date - 400), null, null, null, gen_random_uuid()) $$,
  '22023',
  null,
  'a payment cannot be dated more than a year back'
);

-- ── Expenses stay put ────────────────────────────────────────
select tests.authenticate_as('m5_owner');

insert into public.villa_expenses
  (account_id, property_id, category, description, amount, mode, spent_on, created_by)
values ((select villa_id from m5), (select id from m5p), 'garden', 'Lawn',
        500, 'cash', '2026-06-10', tests.get_supabase_uid('m5_owner'));

update public.villa_expenses
  set created_by = tests.get_supabase_uid('m5_manager'), amount = 600
  where description = 'Lawn';

select is(
  (select created_by from public.villa_expenses where description = 'Lawn'),
  tests.get_supabase_uid('m5_owner'),
  'who recorded an expense cannot be rewritten'
);

select is(
  (select amount from public.villa_expenses where description = 'Lawn'),
  600.00::numeric,
  'the expense itself can be corrected'
);

-- ── Two villas with the same prefix keep separate series ─────
select tests.authenticate_as_service_role();

create temp table m5q on commit drop as
  select public.connect_villa_property((select other_id from m5), 'http://127.0.0.1:1',
    'pgtap-m5b.invalid', 'c0000000-0000-0000-0000-00000000c5b2', 'M5', 'Same prefix',
    'test-service-key-0123456789') as id;

insert into public.villa_bookings_mirror
  (property_id, site_booking_id, account_id, site_property_id, reference_number,
   status, payment_status, check_in, check_out, nights, adults, children, infants,
   base_amount, extra_guest_amount, tax_amount, total_amount, guest_name)
values ((select id from m5q), 'd0000000-0000-0000-0000-00000000b001', (select other_id from m5),
        'c0000000-0000-0000-0000-00000000c5b2', 'REF-Q', 'confirmed', 'unpaid',
        '2026-10-10', '2026-10-12', 2, 2, 0, 0, 100, 0, 18, 118, 'Q');

grant select on m5q to authenticated;

select tests.authenticate_as('m5_other');

select is(
  (select receipt_no from public.record_villa_payment(
     (select id from m5q), 'd0000000-0000-0000-0000-00000000b001',
     'cash', 10, '2026-06-10', null, null, null, gen_random_uuid())),
  'M5/RCT/2627/0001',
  'another villa with the same prefix starts its own series'
);

select * from finish();

ROLLBACK;
