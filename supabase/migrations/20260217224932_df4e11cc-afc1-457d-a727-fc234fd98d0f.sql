
-- Add country column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_country text DEFAULT 'Brasil';
