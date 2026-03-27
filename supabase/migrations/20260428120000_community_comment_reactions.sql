-- Curtidas em comentários da Comunidade (estilo LinkedIn)

CREATE TABLE IF NOT EXISTS public.community_comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.community_post_comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_comment_reactions_comment
  ON public.community_comment_reactions (comment_id);

ALTER TABLE public.community_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_comment_reactions_select
  ON public.community_comment_reactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY community_comment_reactions_insert
  ON public.community_comment_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_comment_reactions_delete
  ON public.community_comment_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.community_comment_reactions TO authenticated;
