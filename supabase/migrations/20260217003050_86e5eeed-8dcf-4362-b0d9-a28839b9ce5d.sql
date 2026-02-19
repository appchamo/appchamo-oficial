
-- Create reviews table to store individual reviews with comments
CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.service_requests(id),
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  client_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view reviews (public reputation)
CREATE POLICY "Anyone can view reviews"
  ON public.reviews FOR SELECT
  USING (true);

-- Only the system (via RPC) inserts reviews
CREATE POLICY "Service role inserts reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- Admins can manage
CREATE POLICY "Admins can manage reviews"
  ON public.reviews FOR ALL
  USING (is_admin(auth.uid()));

-- Update submit_review to also insert into reviews table
CREATE OR REPLACE FUNCTION public.submit_review(_request_id uuid, _rating integer, _comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _pro_id uuid;
  _client_id uuid;
  _current_rating numeric;
  _current_reviews integer;
  _current_services integer;
  _new_reviews integer;
  _new_services integer;
  _new_rating numeric;
BEGIN
  SELECT client_id, professional_id INTO _client_id, _pro_id
  FROM service_requests WHERE id = _request_id;
  
  IF _client_id IS NULL OR _client_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insert review record
  INSERT INTO public.reviews (request_id, professional_id, client_id, rating, comment)
  VALUES (_request_id, _pro_id, _client_id, _rating, _comment);

  -- Get current pro stats
  SELECT rating, total_reviews, total_services INTO _current_rating, _current_reviews, _current_services
  FROM professionals WHERE id = _pro_id;

  _new_reviews := COALESCE(_current_reviews, 0) + 1;
  _new_services := COALESCE(_current_services, 0) + 1;
  _new_rating := ROUND(((COALESCE(_current_rating, 0) * COALESCE(_current_reviews, 0)) + _rating) / _new_reviews, 1);

  UPDATE professionals SET
    rating = _new_rating,
    total_reviews = _new_reviews,
    total_services = _new_services
  WHERE id = _pro_id;

  UPDATE service_requests SET status = 'completed', updated_at = now()
  WHERE id = _request_id;
END;
$$;
