-- Adiciona colunas de detalhamento de taxas na carteira
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS anticipation_fee_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS anticipation_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

-- Corrige os registros existentes usando professional_net das transactions
UPDATE public.wallet_transactions wt
SET
  gross_amount = t.total_amount,
  platform_fee_amount = t.platform_fee,
  amount = COALESCE(t.professional_net, t.total_amount - COALESCE(t.platform_fee, 0)),
  payment_method = 'pix',
  available_at = wt.created_at + INTERVAL '12 hours'
FROM public.transactions t
WHERE wt.transaction_id = t.id;
