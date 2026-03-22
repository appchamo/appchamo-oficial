-- ================================================
-- Período de carência para renovações de assinatura
-- ================================================
-- Registra assinaturas com pagamento recusado e controla
-- as tentativas de recobrança ao longo de 7 dias.
CREATE TABLE IF NOT EXISTS public.subscription_grace_periods (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asaas_subscription_id text        NOT NULL,
  asaas_payment_id      text,           -- ID do pagamento vencido a ser refeito
  attempt_count         int         NOT NULL DEFAULT 0,
  started_at            timestamptz NOT NULL DEFAULT now(),
  last_attempt_at       timestamptz,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  status                text        NOT NULL DEFAULT 'active', -- active | resolved | cancelled
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asaas_subscription_id, status)  -- evita duplicatas enquanto ativo
);

-- Índice para o cron job (busca rápida por status e data)
CREATE INDEX IF NOT EXISTS idx_sgp_active_next
  ON public.subscription_grace_periods (next_attempt_at)
  WHERE status = 'active';

-- RLS: somente service_role (edge functions) acessa diretamente
ALTER TABLE public.subscription_grace_periods ENABLE ROW LEVEL SECURITY;

-- Bloqueia acesso direto de usuários comuns
CREATE POLICY "Apenas service_role acessa grace_periods"
  ON public.subscription_grace_periods
  USING (false);

-- ================================================
-- Controle de notificação admin para repasses disponíveis
-- ================================================
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS admin_transfer_notified boolean NOT NULL DEFAULT false;

-- Índice para o cron job de repasses
CREATE INDEX IF NOT EXISTS idx_wt_transfer_notify
  ON public.wallet_transactions (available_at)
  WHERE status = 'pending' AND admin_transfer_notified = false;
