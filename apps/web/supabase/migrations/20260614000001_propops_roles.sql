-- =============================================================
-- PropOps Permissions — enum extension only.
-- Must be committed in its own transaction before the enum values
-- can be used. Roles + permissions wired in 20260614000002.
-- =============================================================

alter type public.app_permissions add value if not exists 'units.manage';
alter type public.app_permissions add value if not exists 'payments.manage';
alter type public.app_permissions add value if not exists 'reports.view';
