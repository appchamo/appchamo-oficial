-- =============================================================================
-- Reclassifica `subscriptions.source` para refletir a ORIGEM real
-- -----------------------------------------------------------------------------
-- Bug introduzido na migration 20260501: a coluna `source` foi criada com
-- DEFAULT 'asaas_card', então TODOS os registros legados ficaram marcados como
-- "Cartão", inclusive os que foram concedidos manualmente (cortesia).
--
-- Regra correta:
--   apple_original_transaction_id NOT NULL  → apple_iap
--   google_purchase_token         NOT NULL  → google_iap
--   asaas_subscription_id         NOT NULL  → asaas_card  (futuramente: distinguir asaas_pix por payment.billing_type)
--   nenhum identificador externo            → manual_courtesy  (e marca courtesy=true)
--
-- Também trocamos o DEFAULT da coluna para um valor neutro (`manual_courtesy`),
-- para que qualquer INSERT sem `source` explícito caia em "manual" — é o
-- comportamento mais seguro (admin nunca lança um asaas/apple sem o resto da
-- pipeline preencher os campos certos).
-- =============================================================================

-- 1) Apple IAP
UPDATE public.subscriptions
SET source = 'apple_iap'
WHERE apple_original_transaction_id IS NOT NULL
  AND source <> 'apple_iap';

-- 2) Google IAP
UPDATE public.subscriptions
SET source = 'google_iap'
WHERE google_purchase_token IS NOT NULL
  AND source <> 'google_iap';

-- 3) Asaas Cartão (mantém quem já estava certo)
UPDATE public.subscriptions
SET source = 'asaas_card'
WHERE asaas_subscription_id IS NOT NULL
  AND apple_original_transaction_id IS NULL
  AND google_purchase_token IS NULL
  AND source <> 'asaas_card';

-- 4) Sem nenhum identificador externo → manual / cortesia
UPDATE public.subscriptions
SET
  source           = 'manual_courtesy',
  courtesy         = true,
  courtesy_reason  = COALESCE(courtesy_reason, 'Migração: assinatura legada sem identificador de gateway'),
  granted_at       = COALESCE(granted_at, created_at)
WHERE asaas_subscription_id        IS NULL
  AND apple_original_transaction_id IS NULL
  AND google_purchase_token         IS NULL
  AND source <> 'manual_courtesy';

-- 5) Troca o DEFAULT da coluna para algo seguro.
--    Antes: 'asaas_card' (incorreto — assume que toda nova assinatura é via Asaas).
--    Agora: 'manual_courtesy' — toda pipeline (create_subscription, validate_iap_subscription,
--    asaas_webhook, apple_server_notifications, admin_grant_courtesy_subscription)
--    seta `source` explicitamente, então o DEFAULT só pega INSERTs descuidados.
ALTER TABLE public.subscriptions
  ALTER COLUMN source SET DEFAULT 'manual_courtesy';
