-- Adiciona colunas estruturadas de cidade e estado em job_postings
-- para filtrar vagas por localidade do usuário.
ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS city  text,
  ADD COLUMN IF NOT EXISTS state text;

-- Índice para acelerar o filtro por cidade/estado na listagem de vagas
CREATE INDEX IF NOT EXISTS idx_job_postings_city_state
  ON public.job_postings (city, state)
  WHERE active = true;
