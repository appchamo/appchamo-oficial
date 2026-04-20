-- Incrementa o contador de uso de um cupom do profissional após o pagamento
-- ser confirmado pelo cliente. Auto-desativa o cupom se atingir o limite máximo
-- de usos (max_uses), de forma que ele pare de aparecer para os próximos clientes.
--
-- Roda como SECURITY DEFINER para que qualquer cliente autenticado possa
-- registrar o uso do cupom que aplicou no checkout (a RLS normal só permite
-- ao dono do cupom alterá-lo).

CREATE OR REPLACE FUNCTION public.increment_pro_coupon_usage(p_coupon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.professional_coupons
     SET used_count = COALESCE(used_count, 0) + 1,
         active = CASE
                    WHEN max_uses IS NOT NULL
                     AND COALESCE(used_count, 0) + 1 >= max_uses
                    THEN false
                    ELSE active
                  END,
         updated_at = now()
   WHERE id = p_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_pro_coupon_usage(UUID) TO authenticated;

COMMENT ON FUNCTION public.increment_pro_coupon_usage(UUID) IS
  'Incrementa used_count de um cupom do profissional após pagamento confirmado. Desativa se atingir max_uses.';
