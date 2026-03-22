-- Adiciona coluna para taxa de processamento (Asaas/gateway) separada da comissão
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS payment_fee_amount NUMERIC(10,2) DEFAULT 0;

-- Recalcula: platform_fee_amount passa a ser só a comissão
-- (para registros já existentes, o platform_fee da transactions = total, então estimamos a divisão)
-- Mantemos os existentes como estão; novos registros virão corretos do webhook
