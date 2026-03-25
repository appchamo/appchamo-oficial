-- Tempo médio de resposta (cliente chama → profissional aceita o chamado)
-- • accepted_at em service_requests (preenchido ao mudar para status accepted)
-- • Média diária em professionals (pg_cron ~ meia-noite Brasília = 03:00 UTC)

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.service_requests.accepted_at IS 'Momento em que o profissional aceitou o chamado (status → accepted).';

-- Retroativo: aproximação via updated_at (menos preciso que dados novos)
UPDATE public.service_requests
SET accepted_at = updated_at
WHERE status = 'accepted'
  AND accepted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_service_request_accepted_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted')
     AND NEW.accepted_at IS NULL
  THEN
    NEW.accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_requests_accepted_at ON public.service_requests;
CREATE TRIGGER trg_service_requests_accepted_at
  BEFORE INSERT OR UPDATE OF status ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_service_request_accepted_at();

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS avg_response_seconds integer,
  ADD COLUMN IF NOT EXISTS avg_response_sample_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_response_computed_at timestamptz;

COMMENT ON COLUMN public.professionals.avg_response_seconds IS 'Média (segundos) entre created_at do chamado e accepted_at; atualizada pelo job diário.';
COMMENT ON COLUMN public.professionals.avg_response_sample_count IS 'Quantidade de chamados aceitos usados na média.';
COMMENT ON COLUMN public.professionals.avg_response_computed_at IS 'Última vez que a média foi recalculada.';

-- Recalcula todas as médias (apenas chamados aceitos com accepted_at; delta entre 0 e 72h)
CREATE OR REPLACE FUNCTION public.refresh_professional_avg_response_times()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.professionals
  SET
    avg_response_seconds = NULL,
    avg_response_sample_count = 0,
    avg_response_computed_at = now();

  UPDATE public.professionals p
  SET
    avg_response_seconds = sub.avg_sec,
    avg_response_sample_count = sub.cnt,
    avg_response_computed_at = now()
  FROM (
    SELECT
      professional_id,
      ROUND(AVG(delta_sec))::integer AS avg_sec,
      COUNT(*)::integer AS cnt
    FROM (
      SELECT
        sr.professional_id,
        EXTRACT(EPOCH FROM (sr.accepted_at - sr.created_at))::double precision AS delta_sec
      FROM public.service_requests sr
      WHERE sr.status = 'accepted'
        AND sr.accepted_at IS NOT NULL
        AND sr.created_at IS NOT NULL
        AND sr.accepted_at >= sr.created_at
        AND EXTRACT(EPOCH FROM (sr.accepted_at - sr.created_at)) <= 259200 -- até 72h (evita outliers)
    ) t
    GROUP BY professional_id
    HAVING COUNT(*) >= 1
  ) sub
  WHERE p.id = sub.professional_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_professional_avg_response_times() IS
  'Atualiza avg_response_* em professionals a partir de service_requests aceitos. Agendado 1x/dia (meia-noite BRT).';

GRANT EXECUTE ON FUNCTION public.refresh_professional_avg_response_times() TO postgres;
GRANT EXECUTE ON FUNCTION public.refresh_professional_avg_response_times() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'professional-avg-response-refresh-midnight') THEN
    PERFORM cron.unschedule('professional-avg-response-refresh-midnight');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'professional-avg-response-refresh-afternoon') THEN
    PERFORM cron.unschedule('professional-avg-response-refresh-afternoon');
  END IF;
END
$$;

-- Meia-noite em Brasília (UTC−3): 03:00 UTC
SELECT cron.schedule(
  'professional-avg-response-refresh-midnight',
  '0 3 * * *',
  'SELECT public.refresh_professional_avg_response_times();'
);

-- 13:59 em Brasília: 16:59 UTC
SELECT cron.schedule(
  'professional-avg-response-refresh-afternoon',
  '59 16 * * *',
  'SELECT public.refresh_professional_avg_response_times();'
);

-- Primeira execução imediata ao aplicar migration (dados históricos com accepted_at backfill)
SELECT public.refresh_professional_avg_response_times();

NOTIFY pgrst, 'reload schema';
