-- Job postings table
CREATE TABLE public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  salary_range text,
  requirements text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

-- Anyone can view active job postings
CREATE POLICY "Anyone can view active jobs" ON public.job_postings
  FOR SELECT USING (active = true);

-- Admins can view all
CREATE POLICY "Admins can view all jobs" ON public.job_postings
  FOR SELECT USING (is_admin(auth.uid()));

-- Admins can manage all
CREATE POLICY "Admins can manage jobs" ON public.job_postings
  FOR ALL USING (is_admin(auth.uid()));

-- Owner can insert
CREATE POLICY "Owner can insert jobs" ON public.job_postings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
  );

-- Owner can update own
CREATE POLICY "Owner can update own jobs" ON public.job_postings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
  );

-- Owner can delete own
CREATE POLICY "Owner can delete own jobs" ON public.job_postings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
  );

-- Trigger for updated_at
CREATE TRIGGER update_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Job applications table
CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  resume_url text,
  description text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Applicants can view own
CREATE POLICY "Applicants can view own applications" ON public.job_applications
  FOR SELECT USING (auth.uid() = applicant_id);

-- Job owner can view applications
CREATE POLICY "Job owner can view applications" ON public.job_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM job_postings jp
      JOIN professionals p ON p.id = jp.professional_id
      WHERE jp.id = job_applications.job_id AND p.user_id = auth.uid()
    )
  );

-- Authenticated users can apply
CREATE POLICY "Users can apply to jobs" ON public.job_applications
  FOR INSERT WITH CHECK (auth.uid() = applicant_id);

-- Job owner can update application status
CREATE POLICY "Job owner can update applications" ON public.job_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM job_postings jp
      JOIN professionals p ON p.id = jp.professional_id
      WHERE jp.id = job_applications.job_id AND p.user_id = auth.uid()
    )
  );

-- Admins can manage
CREATE POLICY "Admins can manage applications" ON public.job_applications
  FOR ALL USING (is_admin(auth.uid()));
