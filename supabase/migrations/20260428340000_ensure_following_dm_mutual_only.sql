-- DM após seguir o profissional: passa a exigir seguimento mútuo (user_follows nos dois sentidos).

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

  IF NOT public.professional_is_mutual_with_viewer(p_professional_id) THEN
    RAISE EXCEPTION 'mutual follow required to open direct message';
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

COMMENT ON FUNCTION public.ensure_following_direct_thread(uuid) IS
  'Garante thread DM following; requer professional_is_mutual_with_viewer (ambos seguem em user_follows).';
