-- Publicar na Comunidade: profissional/empresa precisam de plano Pro, VIP ou Business.
-- Contas ligadas a patrocinador (sponsors.user_id) mantêm permissão sem plano pago.

CREATE OR REPLACE FUNCTION public.can_create_community_post(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_linked_sponsor_user(_uid)
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _uid
        AND lower(trim(COALESCE(s.status, ''))) = 'active'
        AND s.plan_id IN ('pro', 'vip', 'business')
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_create_community_post(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_create_community_post(uuid) IS
  'True se o utilizador pode criar post na Comunidade: patrocinador ligado OU assinatura ativa em pro/vip/business.';

DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;

CREATE POLICY community_posts_insert
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_create_community_post(auth.uid())
    AND (
      public.is_professional_or_company_user(auth.uid())
      OR public.is_linked_sponsor_user(auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
