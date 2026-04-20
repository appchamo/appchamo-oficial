-- Cupons do profissional: virar "auto-aplicável" em vez de digitável.
--
-- Antes: cliente teria que digitar um código (PROMO10 etc.). Como o cupom é
-- DO profissional, no checkout o cliente só clica "Aplicar cupom" e o sistema
-- escolhe automaticamente o melhor cupom ativo desse profissional.
--
-- Por isso:
--   • o campo `code` perde o sentido como identificador único; vira `name`
--     (rótulo opcional, só pro profissional se organizar);
--   • removemos o índice UNIQUE em (professional_id, upper(code));
--   • criamos uma RPC `get_best_active_coupon_for_pro(pro_id, amount)` que
--     devolve o melhor cupom aplicável para uma compra de `amount` reais.

-- 1) Renomeia code → name e torna opcional
ALTER TABLE public.professional_coupons
  RENAME COLUMN code TO name;

ALTER TABLE public.professional_coupons
  ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN public.professional_coupons.name IS
  'Rótulo interno do cupom (visível só para o profissional). Opcional.';

-- 2) Remove o índice único antigo (cupom não é mais identificado por código)
DROP INDEX IF EXISTS public.professional_coupons_pro_code_uniq;

-- 3) Função: melhor cupom ativo aplicável para uma compra de `p_amount` reais
--    junto a um determinado profissional. Retorna NULL se não houver.
--
--    Critério "melhor" = maior valor absoluto de desconto.
--    Para % calculamos sobre p_amount; para 'amount' usamos discount_value
--    diretamente (limitado ao p_amount, pra nunca devolver desconto > compra).
CREATE OR REPLACE FUNCTION public.get_best_active_coupon_for_pro(
  p_professional_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  effective_discount NUMERIC,
  min_purchase NUMERIC,
  max_purchase NUMERIC,
  max_uses INTEGER,
  used_count INTEGER,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.discount_type,
    c.discount_value,
    LEAST(
      p_amount,
      CASE
        WHEN c.discount_type = 'percent' THEN ROUND(p_amount * (c.discount_value / 100.0), 2)
        ELSE c.discount_value
      END
    ) AS effective_discount,
    c.min_purchase,
    c.max_purchase,
    c.max_uses,
    c.used_count,
    c.expires_at
  FROM public.professional_coupons c
  WHERE c.professional_id = p_professional_id
    AND c.active = true
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
    AND (c.min_purchase IS NULL OR p_amount >= c.min_purchase)
    AND (c.max_purchase IS NULL OR p_amount <= c.max_purchase)
  ORDER BY effective_discount DESC NULLS LAST, c.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_best_active_coupon_for_pro(UUID, NUMERIC) TO authenticated, anon;

COMMENT ON FUNCTION public.get_best_active_coupon_for_pro(UUID, NUMERIC) IS
  'Devolve o melhor cupom ativo do profissional aplicável para compra de p_amount reais.';
