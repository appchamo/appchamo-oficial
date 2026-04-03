-- Visitantes (anon) precisam ler professionals.user_id para vagas ativas (detalhe / candidatura),
-- alinhado ao que utilizadores autenticados já veem para profissionais aprovados.
CREATE POLICY "Anon can view professionals with active job postings"
  ON public.professionals
  FOR SELECT
  TO anon
  USING (
    active = true
    AND profile_status = 'approved'::text
    AND EXISTS (
      SELECT 1
      FROM public.job_postings j
      WHERE j.professional_id = professionals.id
        AND j.active = true
    )
  );
