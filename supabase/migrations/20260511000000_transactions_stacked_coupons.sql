-- Empilhamento de cupons no pagamento de serviço (Fase 2)
--
-- Antes: um pagamento podia ter 1 cupom (do cliente OU do profissional,
-- mutuamente exclusivos). `original_amount` guardava o valor do serviço e
-- `total_amount` o valor efetivamente pago. A Chamô bancava qualquer cupom
-- aplicado — mesmo o do profissional — porque a comissão era calculada sobre
-- `original_amount` (valor cheio).
--
-- Agora:
--   * Um pagamento pode ter até 1 cupom do profissional + 1 cupom do app.
--   * O cupom do profissional reduz a **base de cálculo do profissional**
--     (profissional banca o próprio cupom; comissão/taxas passam a ser
--     calculadas sobre `subtotal - pro_coupon_discount_amount`).
--   * O cupom do app (tabela `coupons`) é bancado pela Chamô — não afeta
--     a base do profissional; só reduz o `total_amount` pago pelo cliente.
--
-- Nova semântica das colunas (em transactions):
--   subtotal_amount              = valor do serviço antes de qualquer cupom
--   pro_coupon_discount_amount   = R$ descontados pelo cupom do profissional
--   app_coupon_discount_amount   = R$ descontados pelo cupom do app
--   original_amount (nova leitura) = subtotal_amount - pro_coupon_discount_amount
--                                   (= base usada p/ comissão, taxas e líquido)
--   total_amount                 = original_amount - app_coupon_discount_amount
--                                  (+ eventuais taxas de cartão, se o cliente pagar)

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS pro_coupon_id UUID,
  ADD COLUMN IF NOT EXISTS pro_coupon_discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_coupon_id UUID,
  ADD COLUMN IF NOT EXISTS app_coupon_discount_amount NUMERIC NOT NULL DEFAULT 0;

-- Índices úteis para relatórios/admin (só linhas com cupom).
CREATE INDEX IF NOT EXISTS idx_transactions_pro_coupon
  ON public.transactions(pro_coupon_id)
  WHERE pro_coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_app_coupon
  ON public.transactions(app_coupon_id)
  WHERE app_coupon_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.subtotal_amount IS
  'Valor do serviço antes de qualquer cupom (valor que o profissional cobrou).';
COMMENT ON COLUMN public.transactions.pro_coupon_id IS
  'Cupom do profissional aplicado na compra (se houver). Profissional banca: reduz a base de cálculo de comissão e taxas.';
COMMENT ON COLUMN public.transactions.pro_coupon_discount_amount IS
  'Valor em R$ descontado pelo cupom do profissional.';
COMMENT ON COLUMN public.transactions.app_coupon_id IS
  'Cupom do app (tabela coupons) aplicado na compra. Chamô banca: não afeta a base do profissional.';
COMMENT ON COLUMN public.transactions.app_coupon_discount_amount IS
  'Valor em R$ descontado pelo cupom do app.';

-- Backfill: para transações antigas, assumimos que subtotal == original_amount
-- (não há como distinguir histórico entre cupom do app ou do profissional).
-- Isso preserva o comportamento antigo e mantém relatórios consistentes.
UPDATE public.transactions
SET subtotal_amount = COALESCE(original_amount, total_amount)
WHERE subtotal_amount IS NULL;
