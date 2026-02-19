
-- Add address fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text;

-- Add unique partial indexes for CPF and CNPJ (ignoring nulls/empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cpf_unique 
  ON public.profiles (cpf) WHERE cpf IS NOT NULL AND cpf != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cnpj_unique 
  ON public.profiles (cnpj) WHERE cnpj IS NOT NULL AND cnpj != '';

-- Fix profiles RLS: the "Anyone can view professional profiles" should be PERMISSIVE, not RESTRICTIVE
-- Drop and recreate as permissive
DROP POLICY IF EXISTS "Anyone can view professional profiles" ON public.profiles;
CREATE POLICY "Anyone can view professional profiles"
  ON public.profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM professionals p
    WHERE p.user_id = profiles.user_id AND p.active = true
  ));

-- Also make other SELECT policies permissive (they were restrictive which requires ALL to pass)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_admin(auth.uid()));
