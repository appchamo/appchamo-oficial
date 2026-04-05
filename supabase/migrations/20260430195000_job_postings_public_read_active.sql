-- Candidatos (sessão anon ou authenticated) precisam ler job_postings.active = true.
-- Recria a política com TO explícito para evitar ambientes onde só authenticated via a linha.
DROP POLICY IF EXISTS "Anyone can view active jobs" ON public.job_postings;

CREATE POLICY "Anyone can view active jobs"
  ON public.job_postings
  FOR SELECT
  TO anon, authenticated
  USING (active IS TRUE);
