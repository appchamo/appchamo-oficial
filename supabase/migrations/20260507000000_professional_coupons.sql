-- Cupons criados pelo PROFISSIONAL (≠ tabela `coupons` que é da plataforma).
--
-- Cada profissional pode criar cupons para os clientes dele usarem na hora de
-- contratar. O profissional banca o desconto. Pode ser valor fixo (R$) ou
-- percentual (%). Pode ter limite de usos (1 = uma única compra) ou ser
-- ilimitado (max_uses NULL).
--
-- O perfil público mostra "Contrate com desconto" se houver pelo menos 1
-- cupom ativo (active = true e não expirado e ainda com usos disponíveis).

CREATE TABLE IF NOT EXISTS public.professional_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  /** Código que o cliente digita (uppercase, único por profissional). */
  code TEXT NOT NULL,
  /** 'amount' = R$ fixo; 'percent' = % do valor da compra. */
  discount_type TEXT NOT NULL CHECK (discount_type IN ('amount', 'percent')),
  /** Valor do desconto: reais (cents NOT, decimal mesmo) ou percentual 0..100. */
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  /** Compra mínima exigida para usar o cupom. NULL = sem mínimo. */
  min_purchase NUMERIC(10,2),
  /** Compra máxima permitida (teto). NULL = sem teto. */
  max_purchase NUMERIC(10,2),
  /**
   * Limite total de usos do cupom.
   * NULL  = ilimitado.
   * 1     = só uma compra no total.
   * N     = até N usos somados (de qualquer cliente).
   */
  max_uses INTEGER,
  /** Quantas vezes o cupom já foi usado. */
  used_count INTEGER NOT NULL DEFAULT 0,
  /** Permite o profissional pausar o cupom sem deletar. */
  active BOOLEAN NOT NULL DEFAULT true,
  /** Validade opcional. NULL = sem expiração. */
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.professional_coupons IS
  'Cupons de desconto criados por cada profissional para os clientes dele.';

-- Cada profissional não pode ter dois cupons com o mesmo código.
CREATE UNIQUE INDEX IF NOT EXISTS professional_coupons_pro_code_uniq
  ON public.professional_coupons (professional_id, upper(code));

-- Índice para consulta "tem cupom ativo?" (usada na badge do perfil público).
CREATE INDEX IF NOT EXISTS professional_coupons_active_idx
  ON public.professional_coupons (professional_id)
  WHERE active = true;

-- Garante % entre 0 e 100 quando discount_type = 'percent'.
ALTER TABLE public.professional_coupons
  DROP CONSTRAINT IF EXISTS professional_coupons_percent_range;
ALTER TABLE public.professional_coupons
  ADD CONSTRAINT professional_coupons_percent_range
  CHECK (discount_type <> 'percent' OR discount_value <= 100);

-- Trigger para manter updated_at sempre atualizado.
CREATE OR REPLACE FUNCTION public.professional_coupons_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_coupons_updated_at ON public.professional_coupons;
CREATE TRIGGER trg_professional_coupons_updated_at
BEFORE UPDATE ON public.professional_coupons
FOR EACH ROW
EXECUTE FUNCTION public.professional_coupons_set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================

ALTER TABLE public.professional_coupons ENABLE ROW LEVEL SECURITY;

-- Profissional: vê e gerencia (ALL) os próprios cupons.
DROP POLICY IF EXISTS "Pro manages own coupons" ON public.professional_coupons;
CREATE POLICY "Pro manages own coupons"
  ON public.professional_coupons
  FOR ALL
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

-- Qualquer usuário autenticado pode VER cupons ativos (para mostrar o badge
-- "Contrate com desconto" e listar cupons disponíveis num pro). NÃO expomos
-- cupons inativos, expirados ou esgotados via SELECT público.
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.professional_coupons;
CREATE POLICY "Anyone can view active coupons"
  ON public.professional_coupons
  FOR SELECT
  TO authenticated
  USING (
    active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR used_count < max_uses)
  );

-- Admin pode tudo (cobre auditoria/suporte).
DROP POLICY IF EXISTS "Admins manage all coupons" ON public.professional_coupons;
CREATE POLICY "Admins manage all coupons"
  ON public.professional_coupons
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =====================================================================
-- Função: o pro X tem cupom ativo agora? (usada pela UI pública)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.professional_has_active_coupon(p_professional_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professional_coupons c
    WHERE c.professional_id = p_professional_id
      AND c.active = true
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
  );
$$;

GRANT EXECUTE ON FUNCTION public.professional_has_active_coupon(UUID) TO authenticated, anon;
