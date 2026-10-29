-- Villa performance: stop RLS re-evaluating its helpers per row, and index the
-- lookups the villa screens actually make.
--
-- Every villa policy was written as `villa_role(account_id) ...`, with
-- account_id a column reference. villa_role() is SECURITY DEFINER, so Postgres
-- cannot inline it, and the correlation means it cannot hoist it either: it ran
-- ONCE PER ROW. Measured on a 2,982-row villa_bookings_mirror (the Reports
-- query), warm:
--
--     before   1,086 ms      (filter: villa_role(account_id) IS NOT NULL ...)
--     after      252 ms      (filter: account_id IN (hashed SubPlan), loops=1)
--     no RLS     110 ms      (the floor)
--
-- i.e. RLS overhead ~975 ms -> ~140 ms, and it grew linearly with the number of
-- bookings a villa has.
--
-- The fix keeps the authorization rules EXACTLY as they are and only changes how
-- they are evaluated: a new no-column helper returns the set of villa accounts
-- the caller belongs to, which is uncorrelated, so the planner runs it once and
-- hashes the result. `is_super_admin()` is wrapped in `(select ...)` for the same
-- reason — as an InitPlan it is evaluated at most once instead of per row.
--
-- public.villa_role() and public.is_super_admin() are NOT touched (see the
-- is_super_admin incident in OORUDA_KNOWLEDGE.md §9b): villa_role() is still the
-- helper for anything that needs one account's role, including application code.

-- ── 1. Set-returning membership helper ───────────────────────────────────────
-- SECURITY DEFINER for the same reason villa_role() is: accounts_memberships is
-- itself under RLS, and a policy body must not depend on the caller's ability to
-- read it. STABLE so the planner may cache it within a statement.
create or replace function public.villa_account_ids(p_roles text[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select am.account_id
  from public.accounts a
  join public.accounts_memberships am on am.account_id = a.id
  where a.product_type = 'villa'
    and am.user_id = (select auth.uid())
    and (p_roles is null or am.account_role::text = any(p_roles))
$$;

comment on function public.villa_account_ids(text[]) is
  'Villa accounts the current user belongs to, optionally limited to the given roles. Takes no column, so an RLS policy using it is evaluated once per statement rather than once per row (see public.villa_role for the single-account form).';

revoke all on function public.villa_account_ids(text[]) from public;
grant execute on function public.villa_account_ids(text[]) to authenticated, service_role;

-- ── 2. Policies: same rules, hoisted ─────────────────────────────────────────
-- Read policies: "a member of this villa account, or a platform super-admin".
do $$
declare
  t text;
  member_tables text[] := array[
    'villa_account_settings', 'villa_addons', 'villa_booking_activity',
    'villa_booking_guests', 'villa_booking_payments', 'villa_bookings_mirror',
    'villa_discount_audit', 'villa_discount_codes', 'villa_emergency_contacts',
    'villa_expenses', 'villa_guest_document_files', 'villa_guest_documents',
    'villa_guests', 'villa_message_log', 'villa_mirror_sync_state',
    'villa_properties', 'villa_refunds'
  ];
begin
  foreach t in array member_tables loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (
          account_id in (select public.villa_account_ids())
          or (select public.is_super_admin())
        )
    $f$, t || '_read', t);
  end loop;
end $$;

-- Admin-only read policies.
do $$
declare
  t text;
  admin_read text[] := array['villa_guest_document_access', 'villa_sync_log'];
  pol text;
begin
  foreach t in array admin_read loop
    pol := case t
             when 'villa_sync_log' then 'villa_sync_log_admin_read'
             else t || '_read'
           end;
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (
          account_id in (select public.villa_account_ids(array['villa_admin']))
          or (select public.is_super_admin())
        )
    $f$, pol, t);
  end loop;
end $$;

-- Admin write policies (settings, add-ons, emergency contacts, properties).
do $$
declare
  t text;
  admin_write text[] := array[
    'villa_account_settings', 'villa_addons', 'villa_emergency_contacts'
  ];
  admin_expr constant text :=
    $e$(account_id in (select public.villa_account_ids(array['villa_admin'])) or (select public.is_super_admin()))$e$;
begin
  foreach t in array admin_write loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check %s',
      t || '_admin_insert', t, admin_expr);

    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using %s with check %s',
      t || '_admin_update', t, admin_expr, admin_expr);

    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using %s',
      t || '_admin_delete', t, admin_expr);
  end loop;

  -- villa_properties has an update policy but no insert/delete one.
  execute format('drop policy if exists %I on public.%I', 'villa_properties_admin_update', 'villa_properties');
  execute format(
    'create policy %I on public.%I for update to authenticated using %s with check %s',
    'villa_properties_admin_update', 'villa_properties', admin_expr, admin_expr);
end $$;

-- villa_expenses writes: admin or manager, and no super-admin branch (as before).
drop policy if exists villa_expenses_insert on public.villa_expenses;
create policy villa_expenses_insert on public.villa_expenses
  for insert to authenticated
  with check (
    account_id in (
      select public.villa_account_ids(array['villa_admin', 'villa_manager'])
    )
    and created_by = (select auth.uid())
  );

drop policy if exists villa_expenses_update on public.villa_expenses;
create policy villa_expenses_update on public.villa_expenses
  for update to authenticated
  using (
    account_id in (
      select public.villa_account_ids(array['villa_admin', 'villa_manager'])
    )
  )
  with check (
    account_id in (
      select public.villa_account_ids(array['villa_admin', 'villa_manager'])
    )
  );

drop policy if exists villa_expenses_delete on public.villa_expenses;
create policy villa_expenses_delete on public.villa_expenses
  for delete to authenticated
  using (
    account_id in (select public.villa_account_ids(array['villa_admin']))
  );

-- ── 3. Indexes the villa screens were missing ────────────────────────────────
-- Plain CREATE INDEX, not CONCURRENTLY: the Supabase CLI runs each migration in
-- a transaction, which CONCURRENTLY cannot join, and these tables hold at most a
-- few thousand rows per villa, so the ShareLock is momentary. The same reasoning
-- as cash_ledger_razorpay_payment_id_idx (20260815000001).

-- The booking page reads a booking's guests by (property, site booking); only
-- account_id and guest_id were indexed, so this was a sequential scan.
create index if not exists villa_booking_guests_booking_idx
  on public.villa_booking_guests (property_id, site_booking_id);

-- The discount codes screen lists by property; only account_id was indexed.
create index if not exists villa_discount_codes_property_idx
  on public.villa_discount_codes (property_id, created_at desc);

-- Reports (payments tab) filters receipts and refunds by property and date;
-- the existing indexes are (account_id, date) and (property_id, booking).
create index if not exists villa_booking_payments_property_paid_idx
  on public.villa_booking_payments (property_id, paid_on desc);

create index if not exists villa_refunds_property_refunded_idx
  on public.villa_refunds (property_id, refunded_on desc);

-- The dashboard KPIs and every report read the mirror as
-- (property, status, overlapping date range). The existing stay index has no
-- status column, so each read scanned every status for the property.
create index if not exists villa_bookings_mirror_property_status_idx
  on public.villa_bookings_mirror (property_id, status, check_in, check_out);

-- ── 4. Self-check ────────────────────────────────────────────────────────────
-- The policies above are rewritten from a table list, so a table whose read
-- policy was named something other than <table>_read would silently gain a
-- SECOND, permissive policy OR'd in beside the old one rather than replacing
-- it. That is exactly the class of mistake OORUDA_KNOWLEDGE.md §9b is about,
-- so the migration refuses to commit unless every villa table ends up with
-- exactly one SELECT policy, and no villa policy still calls villa_role().
do $$
declare
  offender text;
begin
  select string_agg(format('%s (%s select policies)', relname, n), ', ')
    into offender
  from (
    select c.relname, count(*) as n
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname like 'villa\_%'
      and p.polcmd = 'r'
    group by c.relname
    having count(*) <> 1
  ) bad;

  if offender is not null then
    raise exception 'villa RLS rewrite left duplicate/missing select policies: %', offender;
  end if;

  select string_agg(format('%s.%s', c.relname, p.polname), ', ')
    into offender
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname like 'villa\_%'
    and (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%villa_role(%'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%villa_role(%'
    );

  if offender is not null then
    raise exception 'villa policies still calling villa_role() per row: %', offender;
  end if;
end $$;
