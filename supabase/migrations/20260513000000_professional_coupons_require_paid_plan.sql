-- Cupons criados pelo PROFISSIONAL: criação restrita aos planos pagos
-- (Pro / VIP / Business). Free não pode criar — só visualizar e gerenciar
-- (pausar/excluir) os cupons que já existirem (caso de downgrade).
--
-- Front-end: ProMarketing → CouponsTab esconde o botão "Novo cupom" e o
-- formulário quando o plano não é elegível, mas a verdade é aqui no RLS.

-- =============================================================================
-- 1) Função: pode criar cupom de desconto?
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_create_professional_coupon(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = _uid
      AND lower(trim(COALESCE(s.status, ''))) = 'active'
      AND s.plan_id IN ('pro', 'vip', 'business')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_create_professional_coupon(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_create_professional_coupon(uuid) IS
  'True se o utilizador tem assinatura ATIVA em pro/vip/business. Usado pela RLS de INSERT em professional_coupons.';

-- =============================================================================
-- 2) Reescrever RLS: a policy original era FOR ALL (cobre INSERT também).
--    Substituímos por SELECT/UPDATE/DELETE liberados para o dono e INSERT
--    com check de plano pago. Admin segue podendo tudo (policy separada).
-- =============================================================================

-- Drop da policy abrangente anterior (FOR ALL).
DROP POLICY IF EXISTS "Pro manages own coupons" ON public.professional_coupons;

-- SELECT: o dono lista os próprios cupons (inclusive pausados/expirados/sem usos
-- restantes — necessário para o painel). Públicos continuam visíveis pela
-- policy "Anyone can view active coupons".
DROP POLICY IF EXISTS "Pro selects own coupons" ON public.professional_coupons;
CREATE POLICY "Pro selects own coupons"
  ON public.professional_coupons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_coupons.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- INSERT: só com plano pago ativo. Free vê o card de upsell e o backend
-- bloqueia a tentativa caso o cliente burle a UI.
DROP POLICY IF EXISTS "Pro inserts own coupons paid plan" ON public.professional_coupons;
CREATE POLICY "Pro inserts own coupons paid plan"
  ON public.professional_coupons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_coupons.professional_id
        AND p.user_id = auth.uid()
    )
    AND public.can_create_professional_coupon(auth.uid())
  );

-- UPDATE: dono pode pausar/reativar/editar (mantém para suporte a downgrade —
-- o pro precisa conseguir pausar cupons antigos sem assinar de novo).
DROP POLICY IF EXISTS "Pro updates own coupons" ON public.professional_coupons;
CREATE POLICY "Pro updates own coupons"
  ON public.professional_coupons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_coupons.professional_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_coupons.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- DELETE: dono pode excluir.
DROP POLICY IF EXISTS "Pro deletes own coupons" ON public.professional_coupons;
CREATE POLICY "Pro deletes own coupons"
  ON public.professional_coupons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_coupons.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- "Anyone can view active coupons" e "Admins manage all coupons" já existem
-- na migration original e seguem inalteradas.

NOTIFY pgrst, 'reload schema';
