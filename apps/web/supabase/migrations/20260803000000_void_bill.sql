-- =============================================================
-- Void Bill — v1.4
--
-- Allows assoc_admin to mark a bill as Void (soft-cancel) instead
-- of deleting it. Key guarantees:
--
--   1. Bill numbers are never reused. The bill row stays in the
--      table, so the UNIQUE (association_id, bill_no) constraint
--      permanently retires the number — even after voiding.
--
--   2. Bills with any payments or advance credit applied cannot
--      be voided. The admin must reverse those first.
--
--   3. The sync_bill_payment_status trigger no longer overwrites
--      the Void status when payment aggregates change.
--
--   4. Bill generation skips voided bills, so a fresh corrected
--      bill can be generated for the same unit/period/type after
--      voiding the incorrect one.
--
-- Two functions are added:
--   void_bill(p_bill_id, p_reason)        — single bill
--   void_bills_bulk(assoc, period, type, reason) — entire period/type
-- =============================================================


-- ── 1. Add 'Void' to the bills status check constraint ───────────────────────

alter table public.bills
  drop constraint if exists bills_status_check;

alter table public.bills
  add constraint bills_status_check
    check (status in ('Unpaid', 'Partial', 'Paid', 'Overdue', 'Void'));


-- ── 2. Add void audit columns ────────────────────────────────────────────────

alter table public.bills
  add column if not exists void_reason     text,
  add column if not exists voided_at       timestamptz,
  add column if not exists voided_by       uuid references auth.users(id);

comment on column public.bills.void_reason is
  'Admin-provided reason for voiding this bill. Required when status = ''Void''.';
comment on column public.bills.voided_at is
  'Timestamp when the bill was voided.';
comment on column public.bills.voided_by is
  'User who voided the bill.';


-- ── 3. Patch sync_bill_payment_status — skip if already Void ─────────────────
--
-- The trigger currently runs whenever a payment row changes and unconditionally
-- overwrites bills.status. Add an early-exit guard so a voided bill's status
-- is never overwritten back to Unpaid/Partial/Paid by a payment change.

create or replace function public.sync_bill_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id      uuid;
  v_total_amount numeric;
  v_new_paid     numeric;
  v_cur_status   text;
  v_status       text;
begin
  if tg_op = 'DELETE' then
    v_bill_id := old.bill_id;
  else
    v_bill_id := new.bill_id;
  end if;

  select total_amount, status
    into v_total_amount, v_cur_status
    from public.bills
   where id = v_bill_id;

  if not found then
    return null;
  end if;

  -- Never overwrite a voided bill's status.
  if v_cur_status = 'Void' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select coalesce(sum(amount), 0) into v_new_paid
    from public.payments
   where bill_id = v_bill_id;

  v_status := case
    when v_new_paid >= v_total_amount then 'Paid'
    when v_new_paid > 0               then 'Partial'
    else                                   'Unpaid'
  end;

  update public.bills
     set paid_amount      = v_new_paid,
         status           = v_status,
         pdf_url          = null,
         pdf_generated_at = null
   where id = v_bill_id;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;


-- ── 4. void_bill() — single-bill void ────────────────────────────────────────

create or replace function public.void_bill(
  p_bill_id uuid,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_association_id  uuid;
  v_paid_amount     numeric;
  v_advance_applied numeric;
  v_status          text;
  v_caller_role     text;
begin
  -- Load bill
  select association_id,
         paid_amount,
         coalesce(advance_applied, 0),
         status
    into v_association_id, v_paid_amount, v_advance_applied, v_status
    from public.bills
   where id = p_bill_id;

  if not found then
    raise exception 'Bill not found.';
  end if;

  -- Authorization: must be assoc_admin for this association, or super admin.
  select am.account_role into v_caller_role
    from public.associations a
    join public.accounts_memberships am on am.account_id = a.account_id
   where a.id = v_association_id
     and am.user_id = auth.uid()
   limit 1;

  if v_caller_role is null then
    if not (select public.is_super_admin()) then
      raise exception 'Only an association admin can cancel a bill.';
    end if;
  elsif v_caller_role != 'assoc_admin' then
    raise exception 'Only an association admin can cancel a bill.';
  end if;

  -- Block if already voided.
  if v_status = 'Void' then
    raise exception 'This bill is already cancelled.';
  end if;

  -- Block if money has moved.
  if v_paid_amount > 0 then
    raise exception 'This bill has payments recorded against it. Please reverse all payments before cancelling.';
  end if;

  if v_advance_applied > 0 then
    raise exception 'Advance credit has been applied to this bill. Please undo the advance application in Cash Ledger before cancelling.';
  end if;

  -- Void.
  update public.bills
     set status           = 'Void',
         void_reason      = p_reason,
         voided_at        = now(),
         voided_by        = auth.uid(),
         pdf_url          = null,
         pdf_generated_at = null
   where id = p_bill_id;
end;
$$;

grant execute on function public.void_bill(uuid, text) to authenticated;


-- ── 5. void_bills_bulk() — void all eligible bills for a period/type ─────────
--
-- Skips bills that have payments or advance credit — never errors on those,
-- just continues. Returns the count of bills actually voided.

create or replace function public.void_bills_bulk(
  p_association_id uuid,
  p_period         text,      -- 'YYYY-MM'
  p_bill_type      text,      -- 'maintenance' | 'electricity' | 'other_charges' | 'sinking_fund' | 'all'
  p_reason         text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_count       integer := 0;
  v_bill        record;
begin
  -- Authorization: assoc_admin only (bulk void is more destructive).
  select am.account_role into v_caller_role
    from public.associations a
    join public.accounts_memberships am on am.account_id = a.account_id
   where a.id = p_association_id
     and am.user_id = auth.uid()
   limit 1;

  if v_caller_role is null then
    if not (select public.is_super_admin()) then
      raise exception 'Only an association admin can cancel bills in bulk.';
    end if;
  elsif v_caller_role != 'assoc_admin' then
    raise exception 'Only an association admin can cancel bills in bulk.';
  end if;

  for v_bill in
    select id,
           paid_amount,
           coalesce(advance_applied, 0) as advance_applied
      from public.bills
     where association_id = p_association_id
       and period = p_period
       and status != 'Void'
       and (p_bill_type = 'all' or bill_type = p_bill_type)
  loop
    -- Skip bills with money attached — silently continue.
    if v_bill.paid_amount > 0 or v_bill.advance_applied > 0 then
      continue;
    end if;

    update public.bills
       set status           = 'Void',
           void_reason      = p_reason,
           voided_at        = now(),
           voided_by        = auth.uid(),
           pdf_url          = null,
           pdf_generated_at = null
     where id = v_bill.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.void_bills_bulk(uuid, text, text, text) to authenticated;
