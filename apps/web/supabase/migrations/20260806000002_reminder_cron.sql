-- ── Reminder Scheduling & Overdue Recompute ───────────────────────────────────
-- Enables pg_cron + pg_net, creates the overdue-recompute function,
-- and schedules two daily cron jobs.
--
-- PREREQUISITES (set once per environment via superuser / Supabase dashboard):
--   alter database postgres set app.supabase_project_url = 'https://<ref>.supabase.co';
--   alter database postgres set app.supabase_service_key = '<service_role_key>';
-- These are NOT in this migration because they contain secrets.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. Overdue recompute function ─────────────────────────────────────────────
-- Transitions Unpaid/Partial bills to Overdue when due_date < today (IST).
-- Called nightly by pg_cron; also safe to call manually for ad-hoc fixes.

create or replace function public.recompute_overdue_bills()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
  set    status = 'Overdue'
  where  status in ('Unpaid', 'Partial')
    and  due_date < (now() at time zone 'Asia/Kolkata')::date;
end;
$$;

grant execute on function public.recompute_overdue_bills() to service_role;

comment on function public.recompute_overdue_bills() is
  'Transitions unpaid/partial bills to Overdue when due_date has passed. '
  'Safe to call multiple times (idempotent). Scheduled nightly by pg_cron.';

-- ── 2. Cron jobs ──────────────────────────────────────────────────────────────
-- Remove stale jobs first so this migration is safe to re-run.

select cron.unschedule('overdue-recompute') where exists (
  select 1 from cron.job where jobname = 'overdue-recompute'
);

select cron.unschedule('send-reminders') where exists (
  select 1 from cron.job where jobname = 'send-reminders'
);

-- Job 1: 1 AM IST = 19:30 UTC previous day → daily overdue recompute
select cron.schedule(
  'overdue-recompute',
  '30 19 * * *',
  $$ select public.recompute_overdue_bills() $$
);

-- Job 2: 9 AM IST = 03:30 UTC → daily reminder SMS + email dispatch
-- Calls the send-reminders Edge Function via pg_net HTTP POST.
-- Requires app.supabase_project_url and app.supabase_service_key to be set
-- on the database (see PREREQUISITES above).
select cron.schedule(
  'send-reminders',
  '30 3 * * *',
  $$
    select net.http_post(
      url     := current_setting('app.supabase_project_url', true)
                 || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
      ),
      body    := '{}'::jsonb
    )
  $$
);
