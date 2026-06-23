-- =============================================================
-- Week 2 (additive) — Write policy for audit_logs
--
-- `audit_logs` shipped in 20260612000000 with only a `member_read` SELECT
-- policy, so nothing has ever been able to write to it (the dashboard's
-- "Recent activity" widget has always been empty). Every write action now
-- logs an entry via lib/audit-log.ts, so this adds the matching INSERT
-- policy.
--
-- Unlike the operator/admin pattern used elsewhere, this isn't gated by
-- role: any association member may insert a row, but only attributed to
-- themselves (`actor_user_id = auth.uid()`). The underlying mutation being
-- logged was already authorized by its own RLS/role check before this insert
-- runs — the audit row itself grants no additional capability.
--
-- Purely additive: a new policy on an existing table, no change to the
-- existing read policy.
-- =============================================================

create policy "member_insert_own" on public.audit_logs
  for insert
  with check (
    actor_user_id = (select auth.uid())
    and public.is_association_member(association_id)
  );
