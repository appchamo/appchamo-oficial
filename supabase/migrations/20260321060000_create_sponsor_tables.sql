-- Adiciona colunas user_id e weekly_plan na tabela sponsors (se não existirem)
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS weekly_plan TEXT NOT NULL DEFAULT 'free' CHECK (weekly_plan IN ('free', 'pack_14', 'pack_28'));

-- Tabela de stories dos patrocinadores
CREATE TABLE IF NOT EXISTS public.sponsor_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  link_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  views_count INT NOT NULL DEFAULT 0,
  clicks_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de visualizações
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.sponsor_stories(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de cliques
CREATE TABLE IF NOT EXISTS public.story_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.sponsor_stories(id) ON DELETE CASCADE,
  clicker_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: sponsor_stories
ALTER TABLE public.sponsor_stories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sponsor_stories' AND policyname='sponsor_stories_read') THEN
    CREATE POLICY "sponsor_stories_read" ON public.sponsor_stories FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sponsor_stories' AND policyname='sponsor_stories_insert') THEN
    CREATE POLICY "sponsor_stories_insert" ON public.sponsor_stories FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sponsor_stories' AND policyname='sponsor_stories_delete') THEN
    CREATE POLICY "sponsor_stories_delete" ON public.sponsor_stories FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- RLS: story_views
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_views' AND policyname='story_views_insert') THEN
    CREATE POLICY "story_views_insert" ON public.story_views FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_views' AND policyname='story_views_read') THEN
    CREATE POLICY "story_views_read" ON public.story_views FOR SELECT USING (true);
  END IF;
END $$;

-- RLS: story_clicks
ALTER TABLE public.story_clicks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_clicks' AND policyname='story_clicks_insert') THEN
    CREATE POLICY "story_clicks_insert" ON public.story_clicks FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_clicks' AND policyname='story_clicks_read') THEN
    CREATE POLICY "story_clicks_read" ON public.story_clicks FOR SELECT USING (true);
  END IF;
END $$;

-- Funções auxiliares
CREATE OR REPLACE FUNCTION public.count_stories_this_week(p_sponsor_id UUID)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INT
  FROM public.sponsor_stories
  WHERE sponsor_id = p_sponsor_id
    AND created_at >= date_trunc('week', now());
$$;

CREATE OR REPLACE FUNCTION public.sponsor_weekly_limit(p_plan TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_plan
    WHEN 'pack_28' THEN 28
    WHEN 'pack_14' THEN 14
    ELSE 4
  END;
$$;

-- Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
