-- Liberar vaga de emprego para qualquer usuário (admin pode ativar sem plano Business)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_posting_enabled boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.profiles.job_posting_enabled IS 'Se true, usuário pode publicar vagas de emprego mesmo sem plano Business (concedido pelo admin).';
