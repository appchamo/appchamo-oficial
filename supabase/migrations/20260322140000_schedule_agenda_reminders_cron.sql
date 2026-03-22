-- ================================================
-- Agenda cron para lembretes de compromisso
-- Roda a cada 30 minutos para verificar:
--   - 24h antes do evento
--   -  6h antes do evento
--   -  1h antes do evento
-- ================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove cron anterior (caso já exista)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agenda-reminders') THEN
    PERFORM cron.unschedule('agenda-reminders');
  END IF;
END
$$;

-- Função auxiliar que chama a edge function agenda-reminders
-- IMPORTANTE: Substitua 'SUA_SERVICE_ROLE_KEY_AQUI' pela sua chave real antes de executar
--             (a mesma usada na função run_subscription_renewal_retry)
CREATE OR REPLACE FUNCTION public.run_agenda_reminders()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT net.http_post(
    url     := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/agenda-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SUA_SERVICE_ROLE_KEY_AQUI"}'::jsonb,
    body    := '{}'::jsonb
  );
$$;

-- Agenda o cron: roda a cada 30 minutos
SELECT cron.schedule(
  'agenda-reminders',    -- nome do job
  '*/30 * * * *',        -- a cada 30 minutos
  'SELECT public.run_agenda_reminders();'
);
