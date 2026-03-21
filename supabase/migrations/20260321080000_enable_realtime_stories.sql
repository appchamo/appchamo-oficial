-- Habilita Realtime para sponsor_stories (necessário para UPDATE events)
ALTER PUBLICATION supabase_realtime ADD TABLE public.sponsor_stories;

-- Recalcula views_count e clicks_count baseado nas tabelas reais
UPDATE public.sponsor_stories ss
SET views_count = (
  SELECT COUNT(*) FROM public.story_views sv WHERE sv.story_id = ss.id
),
clicks_count = (
  SELECT COUNT(*) FROM public.story_clicks sc WHERE sc.story_id = ss.id
);
