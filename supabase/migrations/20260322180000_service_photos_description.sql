-- Adiciona coluna description às fotos de serviços
ALTER TABLE public.professional_services
  ADD COLUMN IF NOT EXISTS description TEXT;
