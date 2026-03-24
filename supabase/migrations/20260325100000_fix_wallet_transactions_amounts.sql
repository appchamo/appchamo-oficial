-- ============================================================
-- Correção de wallet_transactions calculadas incorretamente
-- ============================================================

-- PASSO 1: recalcula wallet_transactions pendentes de cartão
WITH cfg AS (
  SELECT
    COALESCE(MAX(CASE WHEN key = 'commission_pct'       THEN (value #>> '{}')::numeric END), 10) AS commission_pct,
    COALESCE(MAX(CASE WHEN key = 'card_fee_pct'         THEN (value #>> '{}')::numeric END), 0)  AS card_fee_pct,
    COALESCE(MAX(CASE WHEN key = 'card_fee_fixed'       THEN (value #>> '{}')::numeric END), 0)  AS card_fee_fixed,
    COALESCE(MAX(CASE WHEN key = 'anticipation_fee_pct' THEN (value #>> '{}')::numeric END), 0)  AS anticipation_fee_pct
  FROM public.platform_settings
  WHERE key IN ('commission_pct', 'card_fee_pct', 'card_fee_fixed', 'anticipation_fee_pct')
),
new_values AS (
  SELECT
    wt.id,
    COALESCE(t.original_amount, t.total_amount) AS gross,
    ROUND(COALESCE(t.original_amount, t.total_amount) * c.commission_pct / 100, 2) AS commission,
    ROUND(COALESCE(t.original_amount, t.total_amount) * c.card_fee_pct / 100 + c.card_fee_fixed, 2) AS card_fee,
    CASE WHEN wt.anticipation_enabled
      THEN ROUND(COALESCE(t.original_amount, t.total_amount) * c.anticipation_fee_pct / 100, 2)
      ELSE 0
    END AS anticipation_fee
  FROM public.wallet_transactions wt
  JOIN public.transactions t ON t.id = wt.transaction_id
  CROSS JOIN cfg c
  WHERE wt.payment_method = 'card'
    AND wt.status = 'pending'
)
UPDATE public.wallet_transactions wt
SET
  gross_amount            = nv.gross,
  platform_fee_amount     = nv.commission,
  payment_fee_amount      = nv.card_fee,
  anticipation_fee_amount = nv.anticipation_fee,
  amount                  = ROUND(nv.gross - nv.commission - nv.card_fee - nv.anticipation_fee, 2)
FROM new_values nv
WHERE wt.id = nv.id;

-- PASSO 2: atualiza professional_net nas transactions
WITH cfg AS (
  SELECT
    COALESCE(MAX(CASE WHEN key = 'commission_pct' THEN (value #>> '{}')::numeric END), 10) AS commission_pct,
    COALESCE(MAX(CASE WHEN key = 'card_fee_pct'   THEN (value #>> '{}')::numeric END), 0)  AS card_fee_pct,
    COALESCE(MAX(CASE WHEN key = 'card_fee_fixed' THEN (value #>> '{}')::numeric END), 0)  AS card_fee_fixed
  FROM public.platform_settings
  WHERE key IN ('commission_pct', 'card_fee_pct', 'card_fee_fixed')
)
UPDATE public.transactions t
SET professional_net = ROUND(
  COALESCE(t.original_amount, t.total_amount)
  - ROUND(COALESCE(t.original_amount, t.total_amount) * c.commission_pct / 100, 2)
  - ROUND(COALESCE(t.original_amount, t.total_amount) * c.card_fee_pct / 100 + c.card_fee_fixed, 2),
  2
)
FROM cfg c
WHERE t.status = 'completed'
  AND COALESCE(t.original_amount, t.total_amount) > 0;
