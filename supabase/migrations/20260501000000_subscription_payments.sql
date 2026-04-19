-- =============================================================================
-- Subscription Payments + status enriquecido + cortesia manual + Apple IAP
-- =============================================================================
-- Objetivo:
--   1. Padronizar o ciclo de vida da assinatura (pending / active / refused /
--      cancelled / courtesy) refletindo o que acontece no gateway.
--   2. Registrar TODAS as cobranças (PIX/Cartão/Asaas, Apple IAP, Google IAP,
--      cortesia manual) em uma única tabela auditável: subscription_payments.
--   3. Suportar o fluxo da App Store onde a confirmação chega na hora mas a
--      cobrança real só acontece 2–3 dias depois (Apple Server Notifications V2
--      grava aqui o resultado real).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Novas colunas em public.subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS source                       text        NOT NULL DEFAULT 'asaas_card',
  ADD COLUMN IF NOT EXISTS last_payment_status          text,                    -- pending | paid | refused | refunded
  ADD COLUMN IF NOT EXISTS last_payment_at              timestamptz,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS apple_environment            text,                    -- Sandbox | Production
  ADD COLUMN IF NOT EXISTS apple_product_id             text,
  ADD COLUMN IF NOT EXISTS google_purchase_token        text,
  ADD COLUMN IF NOT EXISTS courtesy                     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS courtesy_reason              text,
  ADD COLUMN IF NOT EXISTS granted_by_admin_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS granted_at                   timestamptz;

-- Documenta os valores esperados (livre, não enum, para evitar migrations chatas)
COMMENT ON COLUMN public.subscriptions.source IS
  'Origem da assinatura: asaas_card | asaas_pix | apple_iap | google_iap | manual_courtesy';
COMMENT ON COLUMN public.subscriptions.status IS
  'Ciclo do plano: pending | active | refused | cancelled | courtesy (legado: ACTIVE / CANCELED)';

-- Backfill: assinaturas legadas em "ACTIVE" passam a "active". Mantém courtesy=false.
UPDATE public.subscriptions
SET status = 'active'
WHERE status IN ('ACTIVE', 'Ativo');

UPDATE public.subscriptions
SET status = 'cancelled'
WHERE status IN ('CANCELED', 'CANCELLED', 'Cancelado');

-- Tudo que veio do Asaas tem asaas_subscription_id → marca origem
UPDATE public.subscriptions
SET source = 'asaas_card'
WHERE asaas_subscription_id IS NOT NULL
  AND (source IS NULL OR source = '');

CREATE INDEX IF NOT EXISTS idx_subscriptions_status         ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_source         ON public.subscriptions (source);
CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_orig_tx  ON public.subscriptions (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tabela de cobranças de assinatura (auditável)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid        REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id         text        NOT NULL,
  source          text        NOT NULL,                          -- asaas_card | asaas_pix | apple_iap | google_iap | manual_courtesy
  status          text        NOT NULL,                          -- pending | paid | refused | refunded | cancelled | courtesy
  amount          numeric(10,2) NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'BRL',
  external_id     text,                                          -- asaas payment id / apple transactionId / google orderId
  reason          text,                                          -- mensagem opcional (ex.: motivo da cortesia / recusa)
  raw             jsonb,                                         -- payload bruto do gateway (debug)
  occurred_at     timestamptz NOT NULL DEFAULT now(),            -- quando o evento aconteceu de fato (Apple/Asaas)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)                                   -- evita duplicar webhook reentregue
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_user_created ON public.subscription_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status        ON public.subscription_payments (status);
CREATE INDEX IF NOT EXISTS idx_sub_payments_source        ON public.subscription_payments (source);
CREATE INDEX IF NOT EXISTS idx_sub_payments_occurred      ON public.subscription_payments (occurred_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages subscription_payments" ON public.subscription_payments;
CREATE POLICY "Admin manages subscription_payments"
  ON public.subscription_payments
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "User reads own subscription_payments" ON public.subscription_payments;
CREATE POLICY "User reads own subscription_payments"
  ON public.subscription_payments
  FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO service_role;
GRANT SELECT                          ON public.subscription_payments TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: conceder/cancelar cortesia (chamada pelo painel admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_courtesy_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_reason  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_sub_id uuid;
BEGIN
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Apenas administradores podem conceder cortesia';
  END IF;

  IF p_plan_id NOT IN ('pro', 'vip', 'business') THEN
    RAISE EXCEPTION 'Plano inválido para cortesia: %', p_plan_id;
  END IF;

  INSERT INTO public.subscriptions (
    user_id, plan_id, status, source, courtesy, courtesy_reason,
    granted_by_admin_id, granted_at, started_at, billing_period
  )
  VALUES (
    p_user_id, p_plan_id, 'courtesy', 'manual_courtesy', true, p_reason,
    v_caller, now(), now(), 'monthly'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id              = EXCLUDED.plan_id,
        status               = 'courtesy',
        source               = 'manual_courtesy',
        courtesy             = true,
        courtesy_reason      = EXCLUDED.courtesy_reason,
        granted_by_admin_id  = v_caller,
        granted_at           = now(),
        started_at           = now(),
        cancel_at_period_end = false,
        period_ends_at       = NULL,
        last_payment_status  = 'paid',
        last_payment_at      = now(),
        updated_at           = now()
  RETURNING id INTO v_sub_id;

  INSERT INTO public.subscription_payments (
    user_id, subscription_id, plan_id, source, status, amount, reason
  ) VALUES (
    p_user_id, v_sub_id, p_plan_id, 'manual_courtesy', 'courtesy', 0, p_reason
  );

  -- Atualiza tipo de usuário
  UPDATE public.profiles
  SET user_type = CASE WHEN p_plan_id = 'business' THEN 'company' ELSE 'professional' END
  WHERE user_id = p_user_id;

  INSERT INTO public.admin_logs (admin_user_id, action, target_type, target_id, details)
  VALUES (v_caller, 'grant_courtesy_subscription', 'user', p_user_id,
          jsonb_build_object('plan_id', p_plan_id, 'reason', p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_courtesy_subscription(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_grant_courtesy_subscription(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
