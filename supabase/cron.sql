-- Manual alternative to `npm run cron:supabase`. Run in the Supabase SQL editor.
-- Replace <APP_URL> and <CRON_SECRET>. The same CRON_SECRET must be set on the app.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Keep the secret in Vault, not in the job definition.
select vault.create_secret('<CRON_SECRET>', 'agentic_cron_secret', 'agentic.do scheduler');

select cron.schedule(
  'agentic-scheduler-tick',
  '* * * * *',  -- every minute
  $$
  select net.http_get(
    url := '<APP_URL>/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agentic_cron_secret')),
    timeout_milliseconds := 10000
  );
  $$
);

-- Verify (expect status_code 202):
-- select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- select status_code, content, created from net._http_response order by created desc limit 5;
-- Remove:
-- select cron.unschedule('agentic-scheduler-tick');
