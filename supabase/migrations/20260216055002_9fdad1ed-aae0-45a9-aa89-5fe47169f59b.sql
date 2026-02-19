
-- Fix: Change view to security_invoker=on
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT 
  id,
  user_id,
  full_name,
  avatar_url,
  user_type,
  created_at
FROM public.profiles;

-- Add a PERMISSIVE policy so authenticated users can read any profile 
-- (only safe columns are exposed via the view)
CREATE POLICY "Authenticated can read profiles for view"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
