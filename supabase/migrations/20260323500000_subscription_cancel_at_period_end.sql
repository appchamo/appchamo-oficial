-- Adiciona suporte a cancelamento no fim do período pago
-- O usuário continua no plano até period_ends_at, depois volta ao Free

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS period_ends_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_period        TEXT NOT NULL DEFAULT 'monthly';

-- Índice para facilitar busca de assinaturas expiradas
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_ends_at
  ON public.subscriptions (period_ends_at)
  WHERE cancel_at_period_end = TRUE;

-- Função que faz o downgrade automático de assinaturas expiradas
-- Chamada pelo frontend no load, ou pode ser agendada via pg_cron
CREATE OR REPLACE FUNCTION public.expire_cancelled_subscriptions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.subscriptions
  SET
    plan_id              = 'free',
    cancel_at_period_end = FALSE,
    period_ends_at       = NULL,
    status               = 'ACTIVE',
    started_at           = now()
  WHERE
    cancel_at_period_end = TRUE
    AND period_ends_at IS NOT NULL
    AND period_ends_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
