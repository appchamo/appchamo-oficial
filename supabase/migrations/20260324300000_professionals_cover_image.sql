-- Capa do perfil do profissional
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

NOTIFY pgrst, 'reload schema';
