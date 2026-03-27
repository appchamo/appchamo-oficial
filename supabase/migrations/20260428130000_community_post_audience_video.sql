-- Audiência (público / seguidores), vídeo no feed e política de leitura alinhada ao audience

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS audience text;
UPDATE public.community_posts SET audience = 'public' WHERE audience IS NULL;
ALTER TABLE public.community_posts ALTER COLUMN audience SET DEFAULT 'public';
ALTER TABLE public.community_posts ALTER COLUMN audience SET NOT NULL;

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_audience_check;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_audience_check
  CHECK (audience IN ('public', 'followers'));

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_body_or_image;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_body_or_media CHECK (
  length(trim(body)) > 0
  OR (image_url IS NOT NULL AND length(trim(image_url)) > 0)
  OR (video_url IS NOT NULL AND length(trim(video_url)) > 0)
);

DROP POLICY IF EXISTS community_posts_select ON public.community_posts;

CREATE POLICY community_posts_select
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    audience = 'public'
    OR author_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.professionals pr
      INNER JOIN public.professional_follows fl ON fl.professional_id = pr.id
      WHERE pr.user_id = community_posts.author_id
        AND fl.user_id = auth.uid()
    )
  );

COMMENT ON COLUMN public.community_posts.audience IS 'public = todos autenticados; followers = só autor e quem segue o profissional (autor).';
COMMENT ON COLUMN public.community_posts.video_url IS 'URL pública do vídeo no storage (opcional).';
