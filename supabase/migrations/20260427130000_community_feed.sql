-- Feed estilo rede social para profissionais e empresas (Comunidade)

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_body_or_image CHECK (
    length(trim(body)) > 0 OR (image_url IS NOT NULL AND length(trim(image_url)) > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.community_post_reactions (
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'love', 'congrats', 'genius')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_comments_body_len CHECK (length(trim(body)) > 0)
);

CREATE TABLE IF NOT EXISTS public.community_post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_shares_no_self CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created ON public.community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_post_comments_post ON public.community_post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_post_reactions_post ON public.community_post_reactions (post_id);

CREATE OR REPLACE FUNCTION public.is_professional_or_company_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _uid
      AND p.user_type IN ('professional', 'company')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_professional_or_company_user(uuid) TO authenticated;

CREATE TRIGGER update_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_shares ENABLE ROW LEVEL SECURITY;

-- Posts: leitura para autenticados; criar/editar/apagar só autor profissional/empresa
CREATE POLICY community_posts_select
  ON public.community_posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY community_posts_insert
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_professional_or_company_user(auth.uid())
  );

CREATE POLICY community_posts_update
  ON public.community_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY community_posts_delete
  ON public.community_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- Reações: qualquer autenticado
CREATE POLICY community_reactions_select
  ON public.community_post_reactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY community_reactions_insert
  ON public.community_post_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY community_reactions_update
  ON public.community_post_reactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY community_reactions_delete
  ON public.community_post_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Comentários: ler todos; inserir autenticado; apagar próprio ou autor do post
CREATE POLICY community_comments_select
  ON public.community_post_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY community_comments_insert
  ON public.community_post_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY community_comments_delete
  ON public.community_post_comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_post_comments.post_id
        AND p.author_id = auth.uid()
    )
  );

-- Compartilhamentos: registrar e evitar spam — só quem compartilha vê o que enviou; destinatário via notificação
CREATE POLICY community_shares_insert
  ON public.community_post_shares FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY community_shares_select_sender
  ON public.community_post_shares FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_post_reactions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_post_comments TO authenticated;
GRANT SELECT, INSERT ON public.community_post_shares TO authenticated;

-- Bucket público para imagens do feed (path: {user_id}/arquivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-feed',
  'community-feed',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY community_feed_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-feed'
    AND (string_to_array(name, '/'))[1] = auth.uid()::text
  );

CREATE POLICY community_feed_storage_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-feed');

CREATE POLICY community_feed_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-feed'
    AND (string_to_array(name, '/'))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.community_posts IS 'Publicações do feed Comunidade (profissionais/empresas).';
COMMENT ON TABLE public.community_post_reactions IS 'Reações: like, love, congrats, genius.';
COMMENT ON TABLE public.community_post_shares IS 'Encaminhamento de post a outro usuário.';
