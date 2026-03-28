-- Comentários aninhados (respostas ao comentário principal), reações tipadas em comentários,
-- denúncias (central suporte) e ocultar comentário por utilizador

ALTER TABLE public.community_post_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.community_post_comments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_post_comments_parent
  ON public.community_post_comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.community_comment_parent_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  p_post uuid;
  p_parent uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT post_id, parent_id INTO p_post, p_parent
  FROM public.community_post_comments
  WHERE id = NEW.parent_id;
  IF p_post IS NULL THEN
    RAISE EXCEPTION 'Comentário pai não encontrado';
  END IF;
  IF p_post <> NEW.post_id THEN
    RAISE EXCEPTION 'Comentário pai pertence a outro post';
  END IF;
  IF p_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Responda apenas ao comentário principal (não a uma resposta)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comment_parent_check ON public.community_post_comments;
CREATE TRIGGER trg_community_comment_parent_check
  BEFORE INSERT OR UPDATE OF parent_id, post_id ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_comment_parent_check();

-- Tipo de reação no comentário (igual ao post)
ALTER TABLE public.community_comment_reactions
  ADD COLUMN IF NOT EXISTS reaction_type text NOT NULL DEFAULT 'like';

ALTER TABLE public.community_comment_reactions
  DROP CONSTRAINT IF EXISTS community_comment_reactions_reaction_type_check;

ALTER TABLE public.community_comment_reactions
  ADD CONSTRAINT community_comment_reactions_reaction_type_check
  CHECK (reaction_type IN ('like', 'love', 'congrats', 'genius'));

DROP POLICY IF EXISTS community_comment_reactions_update ON public.community_comment_reactions;

CREATE POLICY community_comment_reactions_update
  ON public.community_comment_reactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT UPDATE ON public.community_comment_reactions TO authenticated;

CREATE TABLE IF NOT EXISTS public.community_comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.community_post_comments (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido'))
);

CREATE INDEX IF NOT EXISTS idx_community_comment_reports_created
  ON public.community_comment_reports (created_at DESC);

ALTER TABLE public.community_comment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_comment_reports_insert
  ON public.community_comment_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND length(trim(reason)) >= 10);

CREATE POLICY community_comment_reports_select
  ON public.community_comment_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_admin(auth.uid()));

CREATE POLICY community_comment_reports_update_admin
  ON public.community_comment_reports FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.community_comment_reports TO authenticated;

CREATE TABLE IF NOT EXISTS public.community_comment_user_hides (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.community_post_comments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);

ALTER TABLE public.community_comment_user_hides ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_comment_hides_select
  ON public.community_comment_user_hides FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY community_comment_hides_insert
  ON public.community_comment_user_hides FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_comment_hides_delete
  ON public.community_comment_user_hides FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.community_comment_user_hides TO authenticated;
