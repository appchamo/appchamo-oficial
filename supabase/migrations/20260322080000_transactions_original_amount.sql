-- Adiciona original_amount em transactions (valor antes do desconto de cupom)
-- Permite calcular professional_net baseado no valor original cobrado pelo profissional,
-- garantindo que o cupom do cliente seja absorvido pela plataforma.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2) DEFAULT NULL;

-- Backfill: para transações existentes, original_amount = total_amount
UPDATE public.transactions
SET original_amount = total_amount
WHERE original_amount IS NULL;
