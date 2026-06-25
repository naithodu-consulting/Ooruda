-- =============================================================
-- Association-level permission matrix for assoc_admin
-- -------------------------------------------------------------
-- Super-admin can grant assoc_admin the ability to invite, edit
-- (profile + role), or delete members of specific roles within
-- an association. Each (association_id, target_role) pair holds
-- three boolean flags; all default to false (deny-by-default).
-- =============================================================

create table if not exists public.assoc_admin_permissions (
  id          uuid        unique not null default extensions.uuid_generate_v4(),
  association_id uuid     not null references public.accounts(id) on delete cascade,
  target_role varchar(50) not null references public.roles(name),
  can_invite  boolean     not null default false,
  can_edit    boolean     not null default false,
  can_delete  boolean     not null default false,
  updated_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id),
  unique (association_id, target_role)
);

comment on table public.assoc_admin_permissions is
  'Per-association permission grants that control what assoc_admin can do to members of each lower role.';

comment on column public.assoc_admin_permissions.can_invite is
  'assoc_admin may invite/add new users with this role to the association.';
comment on column public.assoc_admin_permissions.can_edit is
  'assoc_admin may edit the profile and/or role of members who currently hold this role.';
comment on column public.assoc_admin_permissions.can_delete is
  'assoc_admin may remove members who currently hold this role from the association.';

-- ── Trigger: keep updated_at current ──────────────────────────
create or replace function kit.touch_assoc_admin_permissions()
  returns trigger language plpgsql as
$$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_assoc_admin_permissions_updated_at
  before update on public.assoc_admin_permissions
  for each row execute function kit.touch_assoc_admin_permissions();

-- ── Access control ─────────────────────────────────────────────
alter table public.assoc_admin_permissions enable row level security;

revoke all on public.assoc_admin_permissions from authenticated, service_role;
grant select, insert, update, delete on public.assoc_admin_permissions to service_role;
grant select on public.assoc_admin_permissions to authenticated;

-- Super-admin: full read/write
create policy assoc_admin_permissions_super_admin
  on public.assoc_admin_permissions
  for all
  to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

-- assoc_admin of this association: read-only (to gate their own UI)
create policy assoc_admin_permissions_member_read
  on public.assoc_admin_permissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.accounts_memberships am
      where am.user_id    = auth.uid()
        and am.account_id = assoc_admin_permissions.association_id
        and am.account_role = 'assoc_admin'
    )
  );
