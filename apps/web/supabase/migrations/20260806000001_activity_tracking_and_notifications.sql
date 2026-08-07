-- ── 1. Extend audit_logs for comprehensive activity tracking ──────────────────
--    Adds event classification, HTTP context, timing, error info, and metadata.
--    All new columns are nullable so existing rows remain valid.

alter table public.audit_logs
  add column if not exists event_type   text not null default 'user_action'
                                        check (event_type in (
                                          'user_action','api_call','auth_event',
                                          'system_event','error'
                                        )),
  add column if not exists http_method  text,
  add column if not exists path         text,
  add column if not exists status_code  smallint,
  add column if not exists duration_ms  integer,
  add column if not exists error_code   text,
  add column if not exists metadata     jsonb,
  add column if not exists ip_address   text,
  add column if not exists user_agent   text;

-- Make association_id nullable (platform-level system/auth events have no association)
alter table public.audit_logs
  alter column association_id drop not null;

-- Indexes for the new query patterns (event_type filtering, error dashboards)
create index if not exists audit_logs_event_type_created
  on public.audit_logs (event_type, created_at desc);

create index if not exists audit_logs_actor_created
  on public.audit_logs (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists audit_logs_status_code
  on public.audit_logs (status_code, created_at desc)
  where status_code is not null;

-- ── 2. notification_providers_config — super-admin write access ────────────────
--    The table already exists with RLS enabled. Add write policies so the
--    super-admin can create / update platform defaults (association_id IS NULL)
--    and per-association overrides.

drop policy if exists "superadmin_insert" on public.notification_providers_config;
drop policy if exists "superadmin_update" on public.notification_providers_config;
drop policy if exists "superadmin_delete" on public.notification_providers_config;

create policy "superadmin_insert" on public.notification_providers_config
  for insert with check (public.is_super_admin());

create policy "superadmin_update" on public.notification_providers_config
  for update using (public.is_super_admin());

create policy "superadmin_delete" on public.notification_providers_config
  for delete using (public.is_super_admin());

-- ── 4. Seed platform-default notification provider rows ───────────────────────
--    is_active = false so nothing fires until the super-admin enables it.
--    Skipped if rows already exist (idempotent).

insert into public.notification_providers_config
  (association_id, channel, provider_key, is_active, priority)
values
  (null, 'SMS',   'mock',   false, 0),
  (null, 'Email', 'resend', false, 0)
on conflict do nothing;
