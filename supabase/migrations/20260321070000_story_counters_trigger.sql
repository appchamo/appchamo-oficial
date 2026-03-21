-- Trigger para incrementar views_count ao inserir em story_views
CREATE OR REPLACE FUNCTION public.increment_story_views()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.sponsor_stories
  SET views_count = views_count + 1
  WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_story_views ON public.story_views;
CREATE TRIGGER trg_increment_story_views
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.increment_story_views();

-- Trigger para incrementar clicks_count ao inserir em story_clicks
CREATE OR REPLACE FUNCTION public.increment_story_clicks()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.sponsor_stories
  SET clicks_count = clicks_count + 1
  WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_story_clicks ON public.story_clicks;
CREATE TRIGGER trg_increment_story_clicks
  AFTER INSERT ON public.story_clicks
  FOR EACH ROW EXECUTE FUNCTION public.increment_story_clicks();
