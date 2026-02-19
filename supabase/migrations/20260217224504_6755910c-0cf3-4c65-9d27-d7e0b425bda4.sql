
-- Add birth_date column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;

-- Allow anyone to read home_tutorials setting
CREATE POLICY "Anyone can view home tutorials"
ON public.platform_settings
FOR SELECT
USING (key = 'home_tutorials');
