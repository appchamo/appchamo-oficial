-- Avaliação direta pela tela de perfil do profissional (sem atendimento vinculado).
-- O modal do chat (submit_review) continua igual; este é um caminho adicional.

-- Permite review sem request_id (avaliação feita pelo perfil)
ALTER TABLE public.reviews ALTER COLUMN request_id DROP NOT NULL;

-- 1 avaliação de perfil por cliente por profissional (editável). Não afeta reviews de atendimento (request_id preenchido).
CREATE UNIQUE INDEX IF NOT EXISTS reviews_profile_unique
  ON public.reviews (professional_id, client_id)
  WHERE request_id IS NULL;

-- Qualquer usuário logado avalia pelo perfil; recalcula a nota a partir de TODAS as avaliações.
CREATE OR REPLACE FUNCTION public.submit_profile_review(
  _professional_id uuid,
  _rating integer,
  _comment text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _pro_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;

  SELECT user_id INTO _pro_user FROM professionals WHERE id = _professional_id;
  IF _pro_user IS NULL THEN
    RAISE EXCEPTION 'Professional not found';
  END IF;
  IF _pro_user = auth.uid() THEN
    RAISE EXCEPTION 'Cannot review yourself';
  END IF;

  INSERT INTO public.reviews (professional_id, client_id, rating, comment, request_id)
  VALUES (_professional_id, auth.uid(), _rating, _comment, NULL)
  ON CONFLICT (professional_id, client_id) WHERE request_id IS NULL
  DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now();

  UPDATE professionals SET
    rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE professional_id = _professional_id), 0),
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE professional_id = _professional_id)
  WHERE id = _professional_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_profile_review(uuid, integer, text) TO authenticated;
