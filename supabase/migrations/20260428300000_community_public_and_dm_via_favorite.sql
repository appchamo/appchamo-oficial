-- Comunidade: todas as publicações visíveis a todos (audiência única pública no feed).
-- Mensagem direta: abrir thread se seguir OU tiver o profissional nos favoritos.

UPDATE public.community_posts SET audience = 'public' WHERE audience IS DISTINCT FROM 'public';

CREATE OR REPLACE FUNCTION public.ensure_following_direct_thread(p_professional_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.professional_follows pf
    WHERE pf.user_id = v_uid AND pf.professional_id = p_professional_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.professional_favorites pfav
    WHERE pfav.user_id = v_uid AND pfav.professional_id = p_professional_id
  ) THEN
    RAISE EXCEPTION 'adicione este profissional aos favoritos para enviar mensagem direta';
  END IF;

  SELECT id INTO v_req
  FROM public.service_requests
  WHERE client_id = v_uid
    AND professional_id = p_professional_id
    AND request_kind = 'following'
  LIMIT 1;

  IF v_req IS NOT NULL THEN
    RETURN v_req;
  END IF;

  BEGIN
    INSERT INTO public.service_requests (
      client_id,
      professional_id,
      status,
      description,
      request_kind
    ) VALUES (
      v_uid,
      p_professional_id,
      'accepted',
      'Mensagem direta',
      'following'
    )
    RETURNING id INTO v_req;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_req
      FROM public.service_requests
      WHERE client_id = v_uid
        AND professional_id = p_professional_id
        AND request_kind = 'following'
      LIMIT 1;
  END;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'could not create following thread';
  END IF;

  RETURN v_req;
END;
$$;
