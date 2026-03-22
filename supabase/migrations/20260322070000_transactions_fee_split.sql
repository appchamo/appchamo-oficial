-- Adiciona colunas separadas para comissão e taxa de transação
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS commission_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee    NUMERIC(10,2) DEFAULT 0;

-- Backfill: para transações existentes, tenta calcular comissão com a config atual
-- (platform_fee pode ter sido 10% hardcoded, então separamos com base na config atual)
DO $$
DECLARE
  v_commission_pct NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'commission_pct'), 10);
  v_pix_fee_fixed  NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'pix_fee_fixed'), 0);
  v_pix_fee_pct    NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'pix_fee_pct'), 0);
BEGIN
  UPDATE public.transactions
  SET
    commission_fee = ROUND(total_amount * v_commission_pct / 100, 2),
    payment_fee    = ROUND(total_amount * v_pix_fee_pct / 100 + v_pix_fee_fixed, 2)
  WHERE commission_fee = 0;
END $$;
