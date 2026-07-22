-- "total_services" (X serviços no perfil) passa a contar SERVIÇOS CONCLUÍDOS, não avaliações.
-- Antes só subia quando o cliente avaliava (submit_review), então serviço concluído sem avaliação não contava.

-- 1) submit_review deixa de mexer em total_services (só cuida de rating/avaliações).
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
  _new_reviews integer;
  _new_rating numeric;
BEGIN
  SELECT client_id, professional_id INTO _client_id, _pro_id
  FROM service_requests WHERE id = _request_id;

  IF _client_id IS NULL OR _client_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.reviews (request_id, professional_id, client_id, rating, comment)
  VALUES (_request_id, _pro_id, _client_id, _rating, _comment);

  SELECT rating, total_reviews INTO _current_rating, _current_reviews
  FROM professionals WHERE id = _pro_id;

  _new_reviews := COALESCE(_current_reviews, 0) + 1;
  _new_rating := ROUND(((COALESCE(_current_rating, 0) * COALESCE(_current_reviews, 0)) + _rating) / _new_reviews, 1);

  UPDATE professionals SET
    rating = _new_rating,
    total_reviews = _new_reviews
  WHERE id = _pro_id;
END;
$$;

-- 2) Ao concluir uma chamada (status -> 'completed'), soma +1 no total de serviços do profissional.
CREATE OR REPLACE FUNCTION public.trg_inc_pro_total_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.professional_id IS NOT NULL AND NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.professionals
      SET total_services = COALESCE(total_services, 0) + 1, updated_at = now()
      WHERE id = NEW.professional_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inc_pro_total_services ON public.service_requests;
CREATE TRIGGER inc_pro_total_services
  AFTER INSERT OR UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_inc_pro_total_services();

-- 3) Backfill: corrige quem já concluiu serviço e estava subcontado (sem rebaixar ninguém).
UPDATE public.professionals p
  SET total_services = GREATEST(COALESCE(p.total_services, 0), sub.cnt), updated_at = now()
FROM (
  SELECT professional_id, count(*) AS cnt
  FROM public.service_requests
  WHERE status = 'completed' AND professional_id IS NOT NULL
  GROUP BY professional_id
) sub
WHERE p.id = sub.professional_id
  AND COALESCE(p.total_services, 0) < sub.cnt;
