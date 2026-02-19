-- Add icon_url column for custom uploaded icons
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon_url text;