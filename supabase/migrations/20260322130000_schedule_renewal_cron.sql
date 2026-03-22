-- ================================================
-- Habilita extensões necessárias para cron + HTTP
-- ================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ================================================
-- Remove cron anterior (caso já exista)
-- ================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-renewal-retry') THEN
    PERFORM cron.unschedule('subscription-renewal-retry');
  END IF;
END
$$;

-- ================================================
-- Função auxiliar que chama a edge function
-- (usa o service_role_key armazenado como configuração)
-- ================================================
CREATE OR REPLACE FUNCTION public.run_subscription_renewal_retry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_key text;
BEGIN
  -- A chave fica armazenada como configuração do banco (ALTER DATABASE ... SET)
  -- Ela é preenchida abaixo no mesmo arquivo.
  service_key := current_setting('app.settings.service_role_key', true);

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING '[renewal-retry] service_role_key não configurada. Cron não executado.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/subscription-renewal-retry',
    headers := format('{"Content-Type":"application/json","Authorization":"Bearer %s"}', service_key)::jsonb,
    body    := '{}'::jsonb
  );
END;
$$;

-- ================================================
-- Agenda o cron: roda a cada 4 horas
-- ================================================
SELECT cron.schedule(
  'subscription-renewal-retry',   -- nome do job
  '0 */4 * * *',                  -- a cada 4 horas
  'SELECT public.run_subscription_renewal_retry();'
);
