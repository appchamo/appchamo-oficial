-- Crons das novas automações (todos usam x-hook-secret = private.app_config.email_hook_secret).
-- BRT = UTC-3.

-- request-reminders: corrigido (antes passava 'Bearer SEU_CRON_SECRET' e dava 401).
do $$ begin perform cron.unschedule('request-reminders'); exception when others then null; end $$;
select cron.schedule('request-reminders', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/request-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret', (select value from private.app_config where key='email_hook_secret')),
    body := '{}'::jsonb
  );
$cron$);

-- search-match-notify: casar busca sem resultado com pro novo (a cada 3h).
do $$ begin perform cron.unschedule('search-match-notify'); exception when others then null; end $$;
select cron.schedule('search-match-notify', '0 */3 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/search-match-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret', (select value from private.app_config where key='email_hook_secret')),
    body := '{}'::jsonb
  );
$cron$);

-- upgrade-nudge: empurrão de upgrade pro pro free com demanda (segunda 10h BRT = 13 UTC).
do $$ begin perform cron.unschedule('upgrade-nudge'); exception when others then null; end $$;
select cron.schedule('upgrade-nudge', '0 13 * * 1', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/upgrade-nudge',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret', (select value from private.app_config where key='email_hook_secret')),
    body := '{}'::jsonb
  );
$cron$);

-- incomplete-subscription-reminder: assinatura não concluída (diário 14h BRT = 17 UTC).
do $$ begin perform cron.unschedule('incomplete-subscription-reminder'); exception when others then null; end $$;
select cron.schedule('incomplete-subscription-reminder', '0 17 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/incomplete-subscription-reminder',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret', (select value from private.app_config where key='email_hook_secret')),
    body := '{}'::jsonb
  );
$cron$);
