-- ── 1. Fix auto_tag_test_phone_profile: insecure search_path ─────────────────
--
-- SECURITY DEFINER functions must use SET search_path = '' to prevent a
-- malicious user from placing objects in the search path that shadow
-- system functions. The original used SET search_path = public, which
-- is vulnerable to schema-injection.

CREATE OR REPLACE FUNCTION public.auto_tag_test_phone_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.mobile_number IS NOT NULL AND (
    NEW.mobile_number LIKE '+9199110000%'
    OR NEW.mobile_number LIKE '+9199999999%'
  ) THEN
    NEW.is_test := true;
  ELSE
    NEW.is_test := false;
  END IF;
  RETURN NEW;
END;
$$;


-- ── 2. void_bill(): replace inline membership join with association_role() ────
--
-- The previous implementation duplicated the membership lookup that
-- association_role() already handles (including the super-admin fast path).
-- Using the helper ensures consistent behaviour and a single source of truth.

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

  -- Authorization: assoc_admin (or super-admin via association_role).
  v_caller_role := public.association_role(v_association_id);

  if v_caller_role is null or v_caller_role != 'assoc_admin' then
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


-- ── 3. void_bills_bulk(): replace inline membership join with association_role() ─

create or replace function public.void_bills_bulk(
  p_association_id uuid,
  p_period         text,
  p_bill_type      text,
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
  v_caller_role := public.association_role(p_association_id);

  if v_caller_role is null or v_caller_role != 'assoc_admin' then
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
