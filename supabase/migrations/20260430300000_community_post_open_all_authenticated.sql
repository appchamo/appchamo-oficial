-- Comunidade: qualquer utilizador autenticado pode publicar (cliente, profissional grátis ou assinante).

DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;

CREATE POLICY community_posts_insert
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP FUNCTION IF EXISTS public.can_create_community_post(uuid);

NOTIFY pgrst, 'reload schema';
