-- Lembrete automático de cadastro incompleto: todo dia às 10h (Brasília = 13:00 UTC).
-- Só e-mail por enquanto. Quando houver template de WhatsApp aprovado, adiciona
-- 'whatsapp_template' no body deste job.
do $$ begin perform cron.unschedule('incomplete-signup-reminders'); exception when others then null; end $$;

select cron.schedule('incomplete-signup-reminders', '0 13 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/email-incomplete-signups',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select value from private.app_config where key = 'email_hook_secret')),
    body := jsonb_build_object('dry_run', false)
  );
$cron$);
