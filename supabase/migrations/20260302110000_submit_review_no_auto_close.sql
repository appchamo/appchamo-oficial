-- submit_review: deixa de marcar o service_request como 'completed'.
-- O chat permanece aberto após a avaliação; cliente ou profissional encerram manualmente.

CREATE OR REPLACE FUNCTION public.submit_review(
  _request_id uuid,
  _rating integer,
  _comment text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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

  INSERT INTO public.reviews (request_id, professional_id, client_id, rating, comment)
  VALUES (_request_id, _pro_id, _client_id, _rating, _comment);

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

  -- Não altera mais o status do service_request; o chat é encerrado quando alguém clica em "Encerrar chat".
END;
$$;
