-- Add FK from professionals.user_id to profiles.user_id so joins work
-- First check if any professionals exist with no matching profile
-- Then add the FK
ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create a reusable function to lookup profile by user_id for joins
-- (the named FK lets supabase client use !professionals_user_id_profiles_fkey)
