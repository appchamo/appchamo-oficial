
-- 1. Create a public view for profiles that hides sensitive data
CREATE VIEW public.profiles_public
WITH (security_invoker=false) AS
SELECT 
  id,
  user_id,
  full_name,
  avatar_url,
  user_type,
  created_at
FROM public.profiles;

-- 2. Drop the policy that exposes all profile columns to the public
DROP POLICY IF EXISTS "Anyone can view professional profiles" ON public.profiles;

-- 3. Add a safe policy: authenticated users can read only via the view
-- (the view already filters columns, and own-profile + admin policies remain)

-- 4. Fix job_applications: job owner can only view apps for ACTIVE jobs
DROP POLICY IF EXISTS "Job owner can view applications" ON public.job_applications;
CREATE POLICY "Job owner can view applications"
ON public.job_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM job_postings jp
    JOIN professionals p ON p.id = jp.professional_id
    WHERE jp.id = job_applications.job_id
      AND jp.active = true
      AND p.user_id = auth.uid()
  )
);

-- 5. Fix job_applications: job owner can only update apps for ACTIVE jobs
DROP POLICY IF EXISTS "Job owner can update applications" ON public.job_applications;
CREATE POLICY "Job owner can update applications"
ON public.job_applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM job_postings jp
    JOIN professionals p ON p.id = jp.professional_id
    WHERE jp.id = job_applications.job_id
      AND jp.active = true
      AND p.user_id = auth.uid()
  )
);

-- 6. Fix subscriptions: remove user UPDATE to prevent plan/status manipulation
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;

-- 7. Restrict coupon INSERT to server-side only (trigger handles it)
DROP POLICY IF EXISTS "Users can insert own coupons" ON public.coupons;
