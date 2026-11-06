-- =============================================================
-- Ooruda Villa — Serialising receipt writes against each other,
-- and giving the adjustment guard one untorn snapshot to read.
--
-- See OORUDA_VILLA_HANDOVER.md §3.
--
-- WHAT THIS FIXES
--
-- Adjusting a booking's amount refuses to take the total below the money
-- already received. That guard is a read-then-write, and the compare-and-set
-- on the site's `updated_at` cannot close it: receipts live here in
-- `villa_booking_payments` while the total lives on the booking site, and
-- `record_villa_payment` never touches the site row.
--
-- Two things are done about it:
--
--   1. `record_villa_payment` now takes a per-booking advisory lock, so two
--      receipts for one booking can no longer interleave.
--
--   2. `villa_booking_receipts_snapshot` reads receipts and refunds for one
--      booking in a SINGLE transaction under that SAME lock. The adjustment
--      guard used to read the two through separate PostgREST calls, so a
--      payment and its refund could be seen half-applied — it could observe
--      the payment without the refund that cancelled it, or the reverse.
--
-- WHAT THIS DOES NOT FIX, deliberately
--
-- It does NOT make "check the ledger, then write the site row" atomic, and no
-- lock in this database can. The money received is the sum of Ooruda's own
-- receipts AND the site's online (Razorpay) payments, and the total being
-- compared against lives on the site too. Serialising across both would need
-- the two writes in one transaction, which two Postgres instances behind
-- PostgREST cannot give.
--
-- So the compensating write in `adjustMoney` stays. What changes is that its
-- verification now reads a consistent snapshot and cannot race a receipt
-- insert that is half-way through. Closing the rest means either moving the
-- booking total into this database, or a two-phase protocol with the site.
--
-- The lock key is the booking id hashed with `hashtextextended`, which is
-- immutable across sessions and versions (unlike `hashtext` on some
-- upgrades). Both functions must hash it the same way or they take different
-- locks and neither waits for the other.
-- =============================================================

-- ── 1. The shared lock key ───────────────────────────────────────
create or replace function public.villa_booking_lock_key(p_site_booking_id uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended(p_site_booking_id::text, 0);
$$;

comment on function public.villa_booking_lock_key(uuid) is
  'The advisory-lock key for one booking''s money. Every function that locks a booking must use this, or they lock different keys and nothing waits.';

-- ── 2. An untorn view of what has been received ──────────────────
create or replace function public.villa_booking_receipts_snapshot(
  p_property_id uuid,
  p_site_booking_id uuid
)
returns table (received numeric, refunded numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  select account_id into v_account
  from public.villa_properties where id = p_property_id;

  if v_account is null
     or coalesce(public.villa_role(v_account), '') not in ('villa_admin', 'villa_manager') then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  -- The same lock `record_villa_payment` takes. A receipt being written for
  -- this booking either lands before this read or waits for it, so the two
  -- sums below always describe the same moment.
  perform pg_advisory_xact_lock(public.villa_booking_lock_key(p_site_booking_id));

  return query
  select
    coalesce((
      select sum(p.amount)
      from public.villa_booking_payments p
      where p.property_id = p_property_id
        and p.site_booking_id = p_site_booking_id
        and p.voided_at is null
    ), 0)::numeric,
    -- 'failed' refunds never left the account, matching summariseLedger.
    coalesce((
      select sum(r.amount)
      from public.villa_refunds r
      where r.property_id = p_property_id
        and r.site_booking_id = p_site_booking_id
        and r.status <> 'failed'
    ), 0)::numeric;
end;
$$;

comment on function public.villa_booking_receipts_snapshot(uuid, uuid) is
  'Receipts and refunds for one booking, read in one transaction under the booking''s advisory lock, so the adjustment guard cannot see a payment without its refund. Excludes voided receipts and failed refunds, matching summariseLedger.';

revoke all on function public.villa_booking_receipts_snapshot(uuid, uuid) from public, anon;
grant execute on function public.villa_booking_receipts_snapshot(uuid, uuid) to authenticated;

-- ── 3. Receipts for one booking no longer interleave ─────────────
--
-- Reproduced from the live definition (20261020115735, the villa_admin
-- rename) with ONE line added: the advisory lock, taken after the permission
-- check and before the idempotency read, so a retry of the same request and a
-- genuine second payment cannot both pass the request_id check.
--
-- Everything else below is unchanged and was diffed against
-- `pg_get_functiondef` before this migration was written, per CLAUDE.md.
create or replace function public.record_villa_payment(
  p_property_id uuid,
  p_site_booking_id uuid,
  p_mode text,
  p_amount numeric,
  p_paid_on date,
  p_reference text,
  p_payer_name text,
  p_note text,
  p_request_id uuid
)
returns public.villa_booking_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_code    text;
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_row     public.villa_booking_payments;
begin
  select account_id into v_account
  from public.villa_properties where id = p_property_id;

  if v_account is null
     or coalesce(public.villa_role(v_account), '') not in ('villa_admin', 'villa_manager') then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  -- ADDED: serialise every money write for this booking. Held to the end of
  -- the transaction, so the insert below is covered too.
  perform pg_advisory_xact_lock(public.villa_booking_lock_key(p_site_booking_id));

  select * into v_row from public.villa_booking_payments
  where request_id = p_request_id;

  if v_row.id is not null then
    if v_row.property_id <> p_property_id then
      raise exception 'You don''t have permission to do this.' using errcode = '42501';
    end if;
    return v_row;
  end if;

  select booking_code into v_code
  from public.villa_bookings_mirror
  where property_id = p_property_id
    and site_booking_id = p_site_booking_id
    and status in ('confirmed', 'completed');

  if not found then
    raise exception 'Payments can be recorded only for a confirmed stay.' using errcode = '22023';
  end if;

  if p_paid_on > v_today then
    raise exception 'A payment cannot be dated in the future.' using errcode = '22023';
  end if;

  if p_paid_on < v_today - 365 then
    raise exception 'A payment can be dated at most a year back.' using errcode = '22023';
  end if;

  insert into public.villa_booking_payments (
    account_id, property_id, site_booking_id, booking_code, receipt_no,
    mode, amount, paid_on, reference, payer_name, note, request_id, recorded_by
  ) values (
    v_account, p_property_id, p_site_booking_id, v_code,
    kit.villa_next_number(p_property_id, 'receipt', p_paid_on),
    p_mode, round(p_amount, 2), p_paid_on,
    nullif(btrim(p_reference), ''), nullif(btrim(p_payer_name), ''), nullif(btrim(p_note), ''),
    p_request_id, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_villa_payment(uuid, uuid, text, numeric, date, text, text, text, uuid) from public, anon;
grant execute on function public.record_villa_payment(uuid, uuid, text, numeric, date, text, text, text, uuid) to authenticated;
