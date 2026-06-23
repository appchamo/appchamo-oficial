-- Comunidade: reabre a publicação para QUALQUER usuário autenticado
-- (cliente, profissional grátis, profissional pago ou empresa).
--
-- Histórico:
--   • 20260427130000 — INSERT aberto a qualquer autenticado.
--   • 20260430210000 — INSERT exigia plano pago + tipo profissional/sponsor.
--   • 20260430300000 — INSERT abriu para todos os autenticados.
--   • 20260504000000 — INSERT restrito a profissional/empresa (cliente bloqueado).
--   • 20260623000000 — (esta) reabre para todos os autenticados, por decisão do produto.
--
-- O front (CommunityFeed.tsx -> canPost = !!user) espelha esta regra.

DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;

CREATE POLICY community_posts_insert
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

COMMENT ON POLICY community_posts_insert ON public.community_posts IS
  'Qualquer usuario autenticado pode publicar na Comunidade (cliente, profissional ou empresa).';

NOTIFY pgrst, 'reload schema';
