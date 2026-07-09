-- ─── pg_net (for HTTP calls from cron to Edge Functions) ────────────────────
create extension if not exists pg_net;

-- ─── 1. OVERDUE RECOMPUTE FUNCTION ─────────────────────────────────────────
-- Called daily at 1 AM IST (19:30 UTC).
-- Transitions Unpaid/Partial bills to Overdue once their due_date has passed.

create or replace function public.recompute_overdue_bills()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
  set status = 'Overdue'
  where status in ('Unpaid', 'Partial')
    and due_date < current_date;
end;
$$;

grant execute on function public.recompute_overdue_bills() to service_role;

-- ─── 2. CRON: OVERDUE RECOMPUTE — daily at 1 AM IST (19:30 UTC) ────────────
select cron.schedule(
  'overdue-recompute',
  '30 19 * * *',
  $$ select public.recompute_overdue_bills() $$
);

-- ─── 3. CRON: REMINDER SMS — daily at 9 AM IST (03:30 UTC) ─────────────────
-- Calls the send-reminders Edge Function via pg_net.
--
-- PREREQUISITE: Run these once on the linked Supabase project before the cron
-- fires (see TODO.md for steps):
--
--   alter database postgres
--     set app.supabase_project_url to 'https://<project-ref>.supabase.co';
--   alter database postgres
--     set app.supabase_service_key to '<service_role_key>';

select cron.schedule(
  'send-reminders',
  '30 3 * * *',
  $$
    select net.http_post(
      url     := current_setting('app.supabase_project_url')
                 || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer '
                         || current_setting('app.supabase_service_key')
      ),
      body    := '{}'::jsonb
    )
  $$
);
