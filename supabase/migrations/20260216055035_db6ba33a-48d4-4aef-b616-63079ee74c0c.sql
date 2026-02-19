
-- Remove the overly permissive policy (exposes all columns on base table)
DROP POLICY IF EXISTS "Authenticated can read profiles for view" ON public.profiles;

-- Recreate view as security definer (intentional: view IS the security boundary, only safe columns)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
SELECT 
  id,
  user_id,
  full_name,
  avatar_url,
  user_type,
  created_at
FROM public.profiles;
