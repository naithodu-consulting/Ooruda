-- =============================================================
-- Association Auto-Create + Write Policies — Day 5
-- Ensures every team account gets an associations row the moment
-- it is created, and adds write RLS policies for admin actions.
-- =============================================================

-- ── 1. Auto-create associations row on team account creation ──
create or replace function kit.create_association_on_team_create()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_personal_account = false then
    insert into public.associations (account_id)
    values (new.id)
    on conflict (account_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_create_association
  after insert on public.accounts
  for each row
  execute function kit.create_association_on_team_create();

-- ── 2. Backfill existing team accounts ───────────────────────
-- Safe: the seed_builtin_charge_types trigger fires for each inserted row.
insert into public.associations (account_id)
select id from public.accounts
where is_personal_account = false
on conflict (account_id) do nothing;

-- ── 3. Write policies — associations ─────────────────────────
-- INSERT: auto-create trigger is security definer; this policy
-- covers the rare client-side safety-net insert.
create policy "admin_insert" on public.associations
  for insert with check (
    exists (
      select 1 from public.accounts_memberships am
      where am.account_id  = associations.account_id
        and am.user_id      = auth.uid()
        and am.account_role = 'assoc_admin'
    )
  );

-- UPDATE: assoc_admin only
create policy "admin_update" on public.associations
  for update
  using  (public.association_role(id) = 'assoc_admin')
  with check (public.association_role(id) = 'assoc_admin');

-- ── 4. Write policies — billing_settings ─────────────────────
create policy "admin_insert" on public.billing_settings
  for insert with check (
    public.association_role(association_id) = 'assoc_admin'
  );

create policy "admin_update" on public.billing_settings
  for update
  using  (public.association_role(association_id) in ('assoc_admin', 'billing_operator'))
  with check (public.association_role(association_id) in ('assoc_admin', 'billing_operator'));

-- ── 5. Write policies — charge_types ─────────────────────────
-- INSERT: assoc_admin (custom charge types)
create policy "admin_insert" on public.charge_types
  for insert with check (
    public.association_role(association_id) = 'assoc_admin'
  );

-- UPDATE: assoc_admin and billing_operator (e.g. toggle is_active)
create policy "operator_update" on public.charge_types
  for update
  using  (public.association_role(association_id) in ('assoc_admin', 'billing_operator'))
  with check (public.association_role(association_id) in ('assoc_admin', 'billing_operator'));

-- DELETE: assoc_admin only, never builtin rows
create policy "admin_delete" on public.charge_types
  for delete using (
    public.association_role(association_id) = 'assoc_admin'
    and is_builtin = false
  );
