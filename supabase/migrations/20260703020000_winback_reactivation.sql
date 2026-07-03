-- Win-back: reativação de inativos (push + e-mail). Coluna de controle + cron diário.
alter table public.profiles add column if not exists winback_sent_at timestamptz;
comment on column public.profiles.winback_sent_at is 'Última vez que enviamos lembrete de reativação (win-back). Só reenvia se a pessoa voltar (last_seen_at > winback_sent_at) e ficar inativa de novo.';

-- Cron diário às 11h (Brasília = 14:00 UTC). Processa em lotes na própria função.
do $$ begin perform cron.unschedule('winback-reactivation'); exception when others then null; end $$;
select cron.schedule('winback-reactivation', '0 14 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/winback-reactivation',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select value from private.app_config where key = 'email_hook_secret')),
    body := jsonb_build_object('dry_run', false)
  );
$cron$);
