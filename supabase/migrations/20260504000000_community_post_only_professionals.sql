-- Comunidade: apenas profissional pode publicar.
--
-- Histórico:
--   • 20260427130000 — INSERT aberto a qualquer autenticado.
--   • 20260430210000 — INSERT exigia plano pago + tipo profissional/sponsor.
--   • 20260430300000 — INSERT abriu para todos os autenticados (e fez DROP da função
--                      can_create_community_post).
--
-- Nova regra (definida com o produto): cliente comum NÃO publica. Plano não importa
-- (free, pro, vip ou business — todos os profissionais podem publicar).
-- Sponsor vinculado deixa de poder publicar até nova decisão.
--
-- A helper `is_professional_or_company_user(uid)` (definida em
-- 20260429150000_community_notifications_title_and_post_rls.sql) já cobre
-- profile.user_type IN ('professional','company') OU linha aprovada+ativa em
-- public.professionals — exatamente o que queremos como definição de "profissional".

DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;

CREATE POLICY community_posts_insert
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_professional_or_company_user(auth.uid())
  );

COMMENT ON POLICY community_posts_insert ON public.community_posts IS
  'Apenas profissional/empresa pode publicar na Comunidade. Cliente é bloqueado.';
