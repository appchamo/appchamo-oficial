-- Briefing diário do negócio: cron às 8h (Brasília = 11:00 UTC).
do $$ begin perform cron.unschedule('daily-briefing'); exception when others then null; end $$;
select cron.schedule('daily-briefing', '0 11 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/daily-briefing',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select value from private.app_config where key = 'email_hook_secret')),
    body := '{}'::jsonb
  );
$cron$);
