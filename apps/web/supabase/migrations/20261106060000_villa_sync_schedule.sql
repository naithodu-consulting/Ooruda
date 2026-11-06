-- =============================================================
-- Ooruda Villa — Scheduling GET /api/villa/sync
--
-- See OORUDA_VILLA_OPEN_ITEMS.md §B and OORUDA_VILLA_HANDOVER.md §7.
--
-- WHY THIS IS NOT A CONVENIENCE
--
-- The route does three jobs, and two of them cannot be discharged by someone
-- opening a page:
--
--   (a) It deletes guest ID photos past their retention date. The privacy
--       policy states a retention period, so this is a COMPLIANCE
--       OBLIGATION. Until now it ran only when a villa dashboard was opened
--       (villa-month-kpis.tsx, bookings.service.ts). If nobody opened one for
--       longer than the retention period, guest ID documents sat past their
--       date. That is a live gap, not a future one.
--   (b) Guest emails are time-triggered — arrival at 10:00 IST, thank-you
--       three hours after check-out — so they go late or not at all without a
--       scheduler. Hence every 15 minutes rather than nightly.
--
-- The mirror refresh (c) could live on page visits, but it is coupled to (b):
-- the route syncs first so emails are chosen from fresh data.
--
-- WHY pg_cron AND NOT VERCEL CRON
--
-- Vercel Cron needs a paid plan for a 15-minute schedule. pg_cron + pg_net is
-- already how this project schedules the association reminders
-- (20260806000002), so this follows that pattern rather than introducing a
-- second mechanism and a vercel.json that nothing else uses.
--
-- PREREQUISITES — set once per environment, by a superuser, NOT in this
-- migration, because they are secrets and environment-specific:
--
--   alter database postgres set app.villa_app_url     = 'https://<host>';
--   alter database postgres set app.villa_cron_secret = '<CRON_SECRET>';
--
-- `app.villa_app_url` is the deployed app's origin with NO trailing slash
-- (the job appends the path). `app.villa_cron_secret` must equal the app's
-- CRON_SECRET and be at least 32 characters — the route refuses anything
-- shorter, and treats an unset secret as "switched off" rather than "open".
--
-- UNTIL THOSE ARE SET the job runs and does nothing, by design: see the
-- guard in villa_sync_tick(). An unconfigured environment must not fill the
-- cron log with failures, and must certainly not post to a half-built URL.
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. One tick of the schedule ──────────────────────────────────
create or replace function public.villa_sync_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text := nullif(btrim(coalesce(current_setting('app.villa_app_url', true), '')), '');
  v_secret text := nullif(btrim(coalesce(current_setting('app.villa_cron_secret', true), '')), '');
begin
  -- Not configured here: do nothing, quietly. `current_setting(..., true)`
  -- returns null rather than raising when the setting is absent, so this is
  -- the whole of the check.
  if v_url is null or v_secret is null then
    return;
  end if;

  -- The route refuses a secret under 32 characters. Catching it here too
  -- means a misconfigured environment is silent rather than posting every
  -- 15 minutes to be refused 401 every time.
  if length(v_secret) < 32 then
    raise warning 'villa_sync_tick: app.villa_cron_secret is shorter than 32 characters; the sync route will refuse it. Not calling.';
    return;
  end if;

  -- Fire and forget: pg_net queues the request and the response is collected
  -- asynchronously. The route is idempotent — the purge deletes what is past
  -- its date, the mirror refresh is an upsert, and each email is claimed in
  -- villa_message_log before it is sent — so a tick that overlaps a slow
  -- previous run cannot double-send.
  perform net.http_get(
    url     := v_url || '/api/villa/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret
    ),
    -- The route allows itself 300s (maxDuration). Giving pg_net less would
    -- have it record a timeout for a run that is still working.
    timeout_milliseconds := 300000
  );
end;
$$;

comment on function public.villa_sync_tick() is
  'One tick of the villa housekeeping schedule: calls GET /api/villa/sync with the cron secret. Does nothing when app.villa_app_url or app.villa_cron_secret is unset, so an unconfigured environment is silent. Scheduled every 15 minutes as villa-sync.';

revoke all on function public.villa_sync_tick() from public, anon, authenticated;
grant execute on function public.villa_sync_tick() to service_role;

-- ── 2. The schedule ──────────────────────────────────────────────
-- Unschedule first so this migration can be re-run.
select cron.unschedule('villa-sync') where exists (
  select 1 from cron.job where jobname = 'villa-sync'
);

-- Every 15 minutes: the arrival email is due at 10:00 IST and the thank-you
-- three hours after check-out, so a quarter-hour is the coarsest schedule
-- that still sends them near their time.
select cron.schedule(
  'villa-sync',
  '*/15 * * * *',
  $$ select public.villa_sync_tick() $$
);
