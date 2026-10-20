-- =============================================================
-- Ooruda Villa M0 — foundations (see OORUDA_VILLA_PLAN.md §4, §12)
--
-- Introduces a second product on the same Supabase project:
--   * accounts.product_type ('association' | 'villa'), immutable
--   * roles.product_type + villa_owner (10) / villa_manager (11)
--   * DB-level invariant: a membership or invitation role must belong to the
--     same product as its account
--   * the association auto-create trigger skips villa accounts
--   * public.create_villa_account() — service_role only
--   * public.villa_role() — RLS helper, parallel to association_role()
--
-- No existing association behaviour changes: every existing account and role
-- is backfilled to 'association' by the column default.
-- =============================================================

-- ── 1. accounts.product_type ──────────────────────────────────
-- Constant default → metadata-only column add on PG11+, no table rewrite.
alter table public.accounts
  add column if not exists product_type text not null default 'association';

alter table public.accounts
  add constraint accounts_product_type_check
  check (product_type in ('association', 'villa'));

comment on column public.accounts.product_type is
  'Which Ooruda product a team account belongs to. Immutable after insert. '
  'Personal accounts carry the default and it has no meaning for them.';

-- Immutable after creation: switching product would strand every domain row.
create or replace function kit.prevent_account_product_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.product_type is distinct from old.product_type then
    raise exception 'accounts.product_type cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger prevent_account_product_type_change
  before update of product_type on public.accounts
  for each row
  execute function kit.prevent_account_product_type_change();

-- ── 2. roles.product_type + villa roles ───────────────────────
alter table public.roles
  add column if not exists product_type text not null default 'association';

alter table public.roles
  add constraint roles_product_type_check
  check (product_type in ('association', 'villa'));

-- hierarchy_level is UNIQUE across all roles. 1–4 are the association
-- roles, and 5 is used by Makerkit's seed/test 'custom-role', so villa roles
-- start at 10 to leave headroom. Levels are only ever compared within one
-- account, and the invariant in §3 guarantees an account never mixes
-- products, so a villa_owner ranking "below" a tenant globally is never
-- observed.
insert into public.roles (name, hierarchy_level, product_type) values
  ('villa_owner',   10, 'villa'),
  ('villa_manager', 11, 'villa')
on conflict (name) do nothing;

-- role_permissions.id is an identity column whose sequence can lag behind
-- rows inserted with explicit ids (it does locally: seed data). A target-less
-- `on conflict do nothing` then swallows the PRIMARY KEY collision and the
-- insert silently does nothing. Resync the sequence first, and name the
-- conflict target so any future collision fails loudly instead.
select setval(
  pg_get_serial_sequence('public.role_permissions', 'id'),
  coalesce((select max(id) from public.role_permissions), 0) + 1,
  false
);

insert into public.role_permissions (role, permission) values
  ('villa_owner', 'roles.manage'),
  ('villa_owner', 'settings.manage'),
  ('villa_owner', 'members.manage'),
  ('villa_owner', 'invites.manage'),
  ('villa_owner', 'payments.manage'),
  ('villa_owner', 'reports.view')
  -- villa_manager: no Makerkit permissions; operational access is granted
  -- per table through public.villa_role() in later milestones.
on conflict (role, permission) do nothing;

-- ── 3. Role ↔ account product invariant ───────────────────────
-- Catches every write path at once: Makerkit invites, phone invites
-- (invite_to_association_by_phone), role updates, admin tooling, raw SQL.
create or replace function kit.enforce_role_product_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role            text;
  v_account_product text;
  v_is_personal     boolean;
  v_role_product    text;
begin
  -- accounts_memberships.account_role / invitations.role
  v_role := coalesce(to_jsonb(new) ->> 'account_role', to_jsonb(new) ->> 'role');

  if v_role is null then
    return new;
  end if;

  select a.product_type, a.is_personal_account
    into v_account_product, v_is_personal
  from public.accounts a
  where a.id = new.account_id;

  -- Missing account: leave it to the account_id foreign key.
  -- Personal accounts carry no product roles.
  if v_account_product is null or v_is_personal then
    return new;
  end if;

  select r.product_type into v_role_product
  from public.roles r
  where r.name = v_role;

  -- Unknown role: leave it to the account_role/role foreign key, so the
  -- error (and behaviour) for a non-existent role is exactly as before.
  if v_role_product is null then
    return new;
  end if;

  if v_role_product <> v_account_product then
    raise exception 'Role % cannot be used on a % account', v_role, v_account_product
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Fires on account_id changes too: moving a row to another account must be
-- re-checked just like changing its role.
create trigger enforce_role_product_match
  before insert or update of account_role, account_id on public.accounts_memberships
  for each row
  execute function kit.enforce_role_product_match();

create trigger enforce_role_product_match
  before insert or update of role, account_id on public.invitations
  for each row
  execute function kit.enforce_role_product_match();

-- ── 4. Association auto-create skips villa accounts ───────────
-- Previous definition: 20260614000003_assoc_setup.sql. The ONLY change is
-- the added `and new.product_type = 'association'` condition.
create or replace function kit.create_association_on_team_create()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_personal_account = false and new.product_type = 'association' then
    insert into public.associations (account_id)
    values (new.id)
    on conflict (account_id) do nothing;
  end if;
  return new;
end;
$$;

-- ── 5. create_villa_account() ─────────────────────────────────
-- Mirrors public.create_team_account (20260108114816) but sets product_type
-- in the INSERT itself — the AFTER INSERT association trigger reads it — and
-- makes the creator a villa_owner. Service role only, like its twin.
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
  values (new_account.id, user_id, 'villa_owner');

  return new_account;
end;
$$;

revoke all on function public.create_villa_account(text, uuid, text) from public;
revoke all on function public.create_villa_account(text, uuid, text) from authenticated;
grant execute on function public.create_villa_account(text, uuid, text) to service_role;

-- ── 6. villa_role() RLS helper ────────────────────────────────
-- Parallel to public.association_role(). Villa tables key on account_id
-- directly (no associations-style indirection). Returns null for
-- non-members and for non-villa accounts. Super-admin access is granted by
-- separate policies, as for association tables.
create or replace function public.villa_role(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select am.account_role::text
  from public.accounts a
  join public.accounts_memberships am on am.account_id = a.id
  where a.id = p_account_id
    and a.product_type = 'villa'
    and am.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.villa_role(uuid) from public;
grant execute on function public.villa_role(uuid) to authenticated, service_role;

-- ── 7. Ownership transfer promotes to the account's own top role ─
-- public.transfer_team_account_ownership promoted the new owner to
-- public.get_upper_system_role() — the level-1 role, assoc_admin — which the
-- §3 trigger (correctly) rejects on a villa account. get_upper_system_role()
-- is left unchanged: create_team_account depends on it.
create or replace function public.get_upper_role_for_account(p_account_id uuid)
returns varchar
language sql
stable
set search_path = ''
as $$
  select r.name
  from public.roles r
  join public.accounts a on a.product_type = r.product_type
  where a.id = p_account_id
  order by r.hierarchy_level
  limit 1;
$$;

revoke all on function public.get_upper_role_for_account(uuid) from public;
grant execute on function public.get_upper_role_for_account(uuid) to authenticated, service_role;

-- Previous definition: 20221215192558_schema.sql (unchanged since; verified
-- against the live function). The ONLY change is get_upper_system_role() →
-- get_upper_role_for_account(target_account_id), in both places.
create or replace function public.transfer_team_account_ownership(
  target_account_id uuid,
  new_owner_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    if current_user not in('service_role') then
        raise exception 'You do not have permission to transfer account ownership';
    end if;

    -- verify the user is already a member of the account
    if not exists(
        select
            1
        from
            public.accounts_memberships
        where
            target_account_id = account_id
            and user_id = new_owner_id) then
        raise exception 'The new owner must be a member of the account';
    end if;

    -- update the primary owner of the account
    update
        public.accounts
    set
        primary_owner_user_id = new_owner_id
    where
        id = target_account_id
        and is_personal_account = false;

    -- update membership assigning it the hierarchy role
    update
        public.accounts_memberships
    set
        account_role =(
            public.get_upper_role_for_account(target_account_id))
    where
        target_account_id = account_id
        and user_id = new_owner_id
        and account_role <>(
            public.get_upper_role_for_account(target_account_id));

end;
$$;

-- ── 8. Sanity assertion ───────────────────────────────────────
do $$
begin
  if exists (
    select 1 from public.associations s
    join public.accounts a on a.id = s.account_id
    where a.product_type = 'villa'
  ) then
    raise exception 'A villa account has an associations row';
  end if;
end;
$$;
