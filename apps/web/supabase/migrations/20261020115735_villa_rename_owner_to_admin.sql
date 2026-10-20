-- =============================================================
-- Rename villa_owner → villa_admin
--
-- The role previously called "Villa Owner" becomes "Villa Admin" to
-- match the product language. Every data row, RLS policy and security
-- function that hardcodes the old string is updated in one transaction.
-- =============================================================

-- ── 1. Data tables ───────────────────────────────────────────────
-- Temporarily drop FK constraints that reference roles.name so we can
-- rename the role in place without insert/delete gymnastics.
alter table public.accounts_memberships drop constraint accounts_memberships_account_role_fkey;
alter table public.role_permissions     drop constraint role_permissions_role_fkey;
alter table public.invitations          drop constraint invitations_role_fkey;

update public.roles                set name = 'villa_admin'         where name = 'villa_owner';
update public.accounts_memberships set account_role = 'villa_admin' where account_role = 'villa_owner';
update public.role_permissions     set role = 'villa_admin'         where role = 'villa_owner';
update public.invitations          set role = 'villa_admin'         where role = 'villa_owner';

-- Re-add FK constraints.
alter table public.accounts_memberships
  add constraint accounts_memberships_account_role_fkey
  foreign key (account_role) references public.roles(name);
alter table public.role_permissions
  add constraint role_permissions_role_fkey
  foreign key (role) references public.roles(name);
alter table public.invitations
  add constraint invitations_role_fkey
  foreign key (role) references public.roles(name);

-- ── 2. create_villa_account() ────────────────────────────────────
create or replace function public.create_villa_account(
  account_name text,
  user_id      uuid,
  account_slug text default null
)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_account public.accounts;
begin
  if (not public.is_set('enable_team_accounts')) then
    raise exception 'Team accounts are not enabled';
  end if;

  insert into public.accounts (
    name,
    slug,
    is_personal_account,
    primary_owner_user_id,
    product_type)
  values (
    account_name,
    account_slug,
    false,
    user_id,
    'villa')
  returning * into new_account;

  insert into public.accounts_memberships (account_id, user_id, account_role)
  values (new_account.id, user_id, 'villa_admin');

  return new_account;
end;
$$;

-- ── 3. record_villa_payment() ────────────────────────────────────
create or replace function public.record_villa_payment(
  p_property_id      uuid,
  p_site_booking_id  uuid,
  p_mode             text,
  p_amount           numeric,
  p_paid_on          date,
  p_reference        text,
  p_payer_name       text,
  p_note             text,
  p_request_id       uuid
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

-- ── 4. void_villa_payment() ──────────────────────────────────────
create or replace function public.void_villa_payment(
  p_payment_id uuid,
  p_reason     text
)
returns public.villa_booking_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.villa_booking_payments;
begin
  select * into v_row from public.villa_booking_payments
  where id = p_payment_id
  for update;

  if v_row.id is null or public.villa_role(v_row.account_id) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  if v_row.voided_at is not null then
    raise exception 'This receipt is already void.' using errcode = '22023';
  end if;

  if exists (select 1 from public.villa_refunds r where r.payment_id = p_payment_id) then
    raise exception 'This payment has refunds. It cannot be voided.' using errcode = '22023';
  end if;

  update public.villa_booking_payments
  set voided_at = now(), voided_by = (select auth.uid()), void_reason = btrim(p_reason)
  where id = p_payment_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 5. record_villa_refund() ─────────────────────────────────────
create or replace function public.record_villa_refund(
  p_payment_id  uuid,
  p_amount      numeric,
  p_mode        text,
  p_refunded_on date,
  p_reference   text,
  p_reason      text,
  p_request_id  uuid
)
returns public.villa_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay       public.villa_booking_payments;
  v_refunded  numeric;
  v_row       public.villa_refunds;
begin
  select * into v_pay from public.villa_booking_payments
  where id = p_payment_id
  for update;

  if v_pay.id is null or public.villa_role(v_pay.account_id) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  select * into v_row from public.villa_refunds where request_id = p_request_id;

  if v_row.id is not null then
    if v_row.payment_id <> p_payment_id then
      raise exception 'You don''t have permission to do this.' using errcode = '42501';
    end if;
    return v_row;
  end if;

  if v_pay.voided_at is not null then
    raise exception 'This receipt is void.' using errcode = '22023';
  end if;

  if p_refunded_on < v_pay.paid_on
     or p_refunded_on > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Pick a refund date between the payment date and today.' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_refunded
  from public.villa_refunds
  where payment_id = p_payment_id and status <> 'failed';

  if round(p_amount, 2) > v_pay.amount - v_refunded then
    raise exception 'That is more than is left to refund on this payment (₹%).',
      to_char(v_pay.amount - v_refunded, 'FM99999999990.00')
      using errcode = '22023';
  end if;

  insert into public.villa_refunds (
    account_id, property_id, site_booking_id, payment_id, refund_no,
    amount, mode, refunded_on, reference, reason, request_id, recorded_by
  ) values (
    v_pay.account_id, v_pay.property_id, v_pay.site_booking_id, v_pay.id,
    kit.villa_next_number(v_pay.property_id, 'refund', p_refunded_on),
    round(p_amount, 2), p_mode, p_refunded_on,
    nullif(btrim(p_reference), ''), btrim(p_reason), p_request_id, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 6. save_villa_discount() ─────────────────────────────────────
create or replace function public.save_villa_discount(
  p_id                 uuid,
  p_property_id        uuid,
  p_code               text,
  p_discount_type      text,
  p_discount_value     numeric,
  p_max_discount       numeric,
  p_valid_from         date,
  p_valid_to           date,
  p_min_nights         smallint,
  p_min_booking_value  numeric,
  p_max_uses           integer,
  p_max_uses_per_guest smallint,
  p_blackouts          jsonb,
  p_note               text
)
returns public.villa_discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_old     public.villa_discount_codes;
  v_row     public.villa_discount_codes;
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_b       jsonb;
begin
  select account_id into v_account from public.villa_properties where id = p_property_id;

  if v_account is null or public.villa_role(v_account) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_blackouts, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_blackouts, '[]'::jsonb)) > 30 then
    raise exception 'Up to 30 blackout ranges.' using errcode = '22023';
  end if;

  for v_b in select * from jsonb_array_elements(coalesce(p_blackouts, '[]'::jsonb)) loop
    if (v_b ->> 'start') !~ '^\d{4}-\d{2}-\d{2}$' or (v_b ->> 'end') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_b ->> 'end')::date <= (v_b ->> 'start')::date then
      raise exception 'Each blackout needs a start and an end after it.' using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'start', ((b ->> 'start')::date)::text,
           'end', ((b ->> 'end')::date)::text)), '[]'::jsonb)
    into p_blackouts
    from jsonb_array_elements(coalesce(p_blackouts, '[]'::jsonb)) b;

  if p_id is null then
    insert into public.villa_discount_codes (
      account_id, property_id, code, discount_type, discount_value, max_discount,
      valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest,
      blackouts, note, status, created_by
    ) values (
      v_account, p_property_id, v_code, p_discount_type, p_discount_value, p_max_discount,
      p_valid_from, p_valid_to, coalesce(p_min_nights, 1), coalesce(p_min_booking_value, 0),
      p_max_uses, coalesce(p_max_uses_per_guest, 1),
      coalesce(p_blackouts, '[]'::jsonb), nullif(btrim(p_note), ''),
      'paused', (select auth.uid())
    )
    returning * into v_row;

    update public.villa_discount_codes
    set status = case when needs_approval then 'pending_approval' else 'active' end
    where id = v_row.id
    returning * into v_row;

    perform kit.villa_discount_log(v_row, 'created');
    return v_row;
  end if;

  select * into v_old from public.villa_discount_codes
  where id = p_id and property_id = p_property_id
  for update;

  if v_old.id is null then
    raise exception 'That code no longer exists.' using errcode = '22023';
  end if;

  update public.villa_discount_codes set
    code = v_code,
    discount_type = p_discount_type,
    discount_value = p_discount_value,
    max_discount = p_max_discount,
    valid_from = p_valid_from,
    valid_to = p_valid_to,
    min_nights = coalesce(p_min_nights, 1),
    min_booking_value = coalesce(p_min_booking_value, 0),
    max_uses = p_max_uses,
    max_uses_per_guest = coalesce(p_max_uses_per_guest, 1),
    blackouts = coalesce(p_blackouts, '[]'::jsonb),
    note = nullif(btrim(p_note), ''),
    approved_by = null,
    approved_at = null,
    status = 'paused'
  where id = p_id
  returning * into v_row;

  update public.villa_discount_codes
  set status = case
    when needs_approval then 'pending_approval'
    when v_old.status = 'paused' then 'paused'
    else 'active'
  end
  where id = p_id
  returning * into v_row;

  perform kit.villa_discount_log(v_row, 'updated');
  return v_row;
end;
$$;

-- ── 7. set_villa_discount_active() ───────────────────────────────
create or replace function public.set_villa_discount_active(
  p_id     uuid,
  p_active boolean
)
returns public.villa_discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.villa_discount_codes;
begin
  select * into v_row from public.villa_discount_codes where id = p_id for update;

  if v_row.id is null or public.villa_role(v_row.account_id) is distinct from 'villa_admin' then
    raise exception 'You don''t have permission to do this.' using errcode = '42501';
  end if;

  if v_row.status in ('pending_approval', 'rejected') then
    raise exception 'This code is waiting for (or was refused) Ooruda approval.' using errcode = '22023';
  end if;

  update public.villa_discount_codes
  set status = case when p_active then 'active' else 'paused' end
  where id = p_id
  returning * into v_row;

  perform kit.villa_discount_log(v_row, case when p_active then 'resumed' else 'paused' end);
  return v_row;
end;
$$;

-- ── 8. RLS policies: villa_properties ────────────────────────────
drop policy if exists villa_properties_owner_update on public.villa_properties;
create policy villa_properties_admin_update on public.villa_properties
  for update to authenticated
  using (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin())
  with check (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin());

-- ── 9. RLS policies: villa_sync_log ──────────────────────────────
drop policy if exists villa_sync_log_owner_read on public.villa_sync_log;
create policy villa_sync_log_admin_read on public.villa_sync_log
  for select to authenticated
  using (
    public.villa_role(account_id) = 'villa_admin'
    or public.is_super_admin()
  );

-- ── 10. RLS policies: settings tables ────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['villa_account_settings', 'villa_addons', 'villa_emergency_contacts']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);

    execute format($p$
      create policy %I on public.%I for insert to authenticated
      with check (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin())
    $p$, t || '_admin_insert', t);

    execute format($p$
      create policy %I on public.%I for update to authenticated
      using (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin())
      with check (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin())
    $p$, t || '_admin_update', t);

    execute format($p$
      create policy %I on public.%I for delete to authenticated
      using (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin())
    $p$, t || '_admin_delete', t);
  end loop;
end;
$$;

-- ── 11. RLS policies: guest document access ──────────────────────
drop policy if exists villa_guest_document_access_read on public.villa_guest_document_access;
create policy villa_guest_document_access_read on public.villa_guest_document_access
  for select to authenticated
  using (public.villa_role(account_id) = 'villa_admin' or public.is_super_admin());

-- ── 12. RLS policies: expenses ───────────────────────────────────
drop policy if exists villa_expenses_insert on public.villa_expenses;
drop policy if exists villa_expenses_update on public.villa_expenses;
drop policy if exists villa_expenses_delete on public.villa_expenses;

create policy villa_expenses_insert on public.villa_expenses
  for insert to authenticated
  with check (
    public.villa_role(account_id) in ('villa_admin', 'villa_manager')
    and created_by = (select auth.uid())
  );
create policy villa_expenses_update on public.villa_expenses
  for update to authenticated
  using (public.villa_role(account_id) in ('villa_admin', 'villa_manager'))
  with check (public.villa_role(account_id) in ('villa_admin', 'villa_manager'));
create policy villa_expenses_delete on public.villa_expenses
  for delete to authenticated
  using (public.villa_role(account_id) = 'villa_admin');

-- ── 13. Sanity check ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.roles where name = 'villa_owner') then
    raise exception 'villa_owner still exists in roles';
  end if;
  if exists (select 1 from public.accounts_memberships where account_role = 'villa_owner') then
    raise exception 'villa_owner still exists in memberships';
  end if;
end;
$$;
