-- Fix: triggers de contadores de views/clicks precisam de SECURITY DEFINER
-- para conseguirem fazer UPDATE em sponsor_stories sem ser bloqueados por RLS

CREATE OR REPLACE FUNCTION public.increment_story_views()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.sponsor_stories
  SET views_count = views_count + 1
  WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_story_clicks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.sponsor_stories
  SET clicks_count = clicks_count + 1
  WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$;

-- Garante que os triggers existem e apontam para as funções corrigidas
DROP TRIGGER IF EXISTS trg_increment_story_views ON public.story_views;
CREATE TRIGGER trg_increment_story_views
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.increment_story_views();

DROP TRIGGER IF EXISTS trg_increment_story_clicks ON public.story_clicks;
CREATE TRIGGER trg_increment_story_clicks
  AFTER INSERT ON public.story_clicks
  FOR EACH ROW EXECUTE FUNCTION public.increment_story_clicks();

-- REPLICA IDENTITY FULL garante que UPDATE events no Realtime
-- enviem todos os campos (inclui o sponsor_id para filtros funcionarem)
ALTER TABLE public.sponsor_stories REPLICA IDENTITY FULL;

-- Garante que story_views e story_clicks permitem INSERT sem role específica
-- (corrige possível restrição silenciosa)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'story_views' AND policyname = 'story_views_insert_anon'
  ) THEN
    CREATE POLICY "story_views_insert_anon" ON public.story_views
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'story_clicks' AND policyname = 'story_clicks_insert_anon'
  ) THEN
    CREATE POLICY "story_clicks_insert_anon" ON public.story_clicks
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

-- Recalcula contadores para corrigir dados desatualizados
UPDATE public.sponsor_stories ss
SET
  views_count  = (SELECT COUNT(*) FROM public.story_views  sv WHERE sv.story_id = ss.id),
  clicks_count = (SELECT COUNT(*) FROM public.story_clicks sc WHERE sc.story_id = ss.id);

NOTIFY pgrst, 'reload schema';
