-- Vagas de emprego também podem ser publicadas por patrocinadores (sponsors.user_id).

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES public.sponsors (id) ON DELETE CASCADE;

ALTER TABLE public.job_postings
  ALTER COLUMN professional_id DROP NOT NULL;

ALTER TABLE public.job_postings
  ADD CONSTRAINT job_postings_professional_xor_sponsor CHECK (
    (professional_id IS NOT NULL AND sponsor_id IS NULL)
    OR (professional_id IS NULL AND sponsor_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_job_postings_sponsor_id ON public.job_postings (sponsor_id);

-- Dono (profissional ou patrocinador) pode ver as próprias vagas, inclusive pausadas.
DROP POLICY IF EXISTS "Job posting owners can view own rows" ON public.job_postings;
CREATE POLICY "Job posting owners can view own rows" ON public.job_postings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = job_postings.professional_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id = job_postings.sponsor_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can delete own jobs" ON public.job_postings;
CREATE POLICY "Owner can delete own jobs" ON public.job_postings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = job_postings.professional_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id = job_postings.sponsor_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can insert jobs" ON public.job_postings;
CREATE POLICY "Owner can insert jobs" ON public.job_postings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = job_postings.professional_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id = job_postings.sponsor_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can update own jobs" ON public.job_postings;
CREATE POLICY "Owner can update own jobs" ON public.job_postings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = job_postings.professional_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id = job_postings.sponsor_id AND s.user_id = auth.uid()
    )
  );

-- Candidaturas: dono da vaga (pro ou patrocinador) gere candidatos mesmo com vaga pausada.
DROP POLICY IF EXISTS "Job owner can view applications" ON public.job_applications;
CREATE POLICY "Job owner can view applications" ON public.job_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_postings jp
      WHERE jp.id = job_applications.job_id
        AND (
          EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = jp.professional_id AND p.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.sponsors s
            WHERE s.id = jp.sponsor_id AND s.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Job owner can update applications" ON public.job_applications;
CREATE POLICY "Job owner can update applications" ON public.job_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.job_postings jp
      WHERE jp.id = job_applications.job_id
        AND (
          EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = jp.professional_id AND p.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.sponsors s
            WHERE s.id = jp.sponsor_id AND s.user_id = auth.uid()
          )
        )
    )
  );
