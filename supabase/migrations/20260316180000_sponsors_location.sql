-- Localização do patrocinador: onde o patrocinador aparece (todo Brasil, estado ou cidade)
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS location_scope text DEFAULT 'nationwide',
  ADD COLUMN IF NOT EXISTS location_state text,
  ADD COLUMN IF NOT EXISTS location_city text;

COMMENT ON COLUMN public.sponsors.location_scope IS 'nationwide = todo Brasil; state = só no estado; city = só na cidade';
COMMENT ON COLUMN public.sponsors.location_state IS 'Sigla UF (ex: MG) quando scope é state ou city';
COMMENT ON COLUMN public.sponsors.location_city IS 'Nome da cidade quando scope é city';
