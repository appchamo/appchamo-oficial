-- Adiciona coluna carousel_group para agrupar banners em carrossel
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS carousel_group text;

-- Agrupa todos os banners existentes com position = 'carousel' no mesmo grupo
DO $$
DECLARE
  first_id uuid;
BEGIN
  SELECT id INTO first_id FROM public.banners WHERE position = 'carousel' ORDER BY sort_order LIMIT 1;
  IF first_id IS NOT NULL THEN
    UPDATE public.banners SET carousel_group = first_id::text WHERE position = 'carousel';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
