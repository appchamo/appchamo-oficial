-- Perfil do profissional: campos separados para Experiência, Serviços (lista) e Sobre (bio)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS experience text,
  ADD COLUMN IF NOT EXISTS services text[] DEFAULT '{}';

COMMENT ON COLUMN public.professionals.experience IS 'Texto livre sobre anos de experiência e atuação no mercado.';
COMMENT ON COLUMN public.professionals.services IS 'Lista de serviços oferecidos (um por item).';
-- bio já existe: uso como "Sobre" (texto sobre o profissional).
