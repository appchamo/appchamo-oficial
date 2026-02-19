
-- Function to increment sponsor clicks atomically
CREATE OR REPLACE FUNCTION public.increment_sponsor_clicks(_sponsor_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.sponsors SET clicks = clicks + 1 WHERE id = _sponsor_id;
$$;
