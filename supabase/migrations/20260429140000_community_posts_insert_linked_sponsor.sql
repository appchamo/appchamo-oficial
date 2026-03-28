-- Contas ligadas a patrocinador (sponsors.user_id) podem criar posts na Comunidade.

CREATE OR REPLACE FUNCTION public.is_linked_sponsor_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sponsors s
    WHERE s.user_id = _uid
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_linked_sponsor_user(uuid) TO authenticated;

DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;

CREATE POLICY community_posts_insert
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_professional_or_company_user(auth.uid())
      OR public.is_linked_sponsor_user(auth.uid())
    )
  );

COMMENT ON FUNCTION public.is_linked_sponsor_user IS
  'True se o utilizador está associado a uma linha em public.sponsors (conta de patrocinador).';

NOTIFY pgrst, 'reload schema';
