-- Ao aceitar pedido (seguir), cria professional_follows / user_follows alinhado ao vínculo de amizade.
-- Pedido inverso (dois querem seguir um ao outro) também materializa as duas arestas de seguimento.

CREATE OR REPLACE FUNCTION public.ensure_follow_edge_internal(p_follower uuid, p_followed uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro uuid;
BEGIN
  IF p_follower IS NULL OR p_followed IS NULL OR p_follower = p_followed THEN
    RETURN;
  END IF;

  SELECT pr.id INTO v_pro FROM public.professionals pr WHERE pr.user_id = p_followed LIMIT 1;

  IF v_pro IS NOT NULL THEN
    INSERT INTO public.professional_follows (user_id, professional_id)
    VALUES (p_follower, v_pro)
    ON CONFLICT (user_id, professional_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_follows (follower_user_id, followed_user_id)
    VALUES (p_follower, p_followed)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

ALTER FUNCTION public.ensure_follow_edge_internal(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_follow_edge_internal(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_to_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_name text;
  v_avatar text;
  v_req uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_to_user_id IS NULL OR p_to_user_id = v_me THEN
    RAISE EXCEPTION 'invalid target';
  END IF;

  v_a := LEAST(v_me, p_to_user_id);
  v_b := GREATEST(v_me, p_to_user_id);

  IF EXISTS (SELECT 1 FROM public.user_friendships f WHERE f.user_a = v_a AND f.user_b = v_b) THEN
    RETURN 'already_friends';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.friend_requests r
    WHERE r.from_user_id = v_me AND r.to_user_id = p_to_user_id
  ) THEN
    RETURN 'request_already_pending';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.friend_requests r
    WHERE r.from_user_id = p_to_user_id AND r.to_user_id = v_me
  ) THEN
    INSERT INTO public.user_friendships (user_a, user_b)
    VALUES (v_a, v_b)
    ON CONFLICT DO NOTHING;
    PERFORM public.ensure_follow_edge_internal(v_me, p_to_user_id);
    PERFORM public.ensure_follow_edge_internal(p_to_user_id, v_me);
    DELETE FROM public.friend_requests r
    WHERE (r.from_user_id = v_me AND r.to_user_id = p_to_user_id)
       OR (r.from_user_id = p_to_user_id AND r.to_user_id = v_me);
    RETURN 'became_friends';
  END IF;

  INSERT INTO public.friend_requests (from_user_id, to_user_id)
  VALUES (v_me, p_to_user_id)
  RETURNING id INTO v_req;

  SELECT
    COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(full_name), ''), 'Alguém'),
    NULLIF(TRIM(avatar_url), '')
  INTO v_name, v_avatar
  FROM public.profiles
  WHERE user_id = v_me;

  INSERT INTO public.notifications (user_id, title, message, type, read, link, image_url, metadata)
  VALUES (
    p_to_user_id,
    v_name,
    'quer seguir você no Chamô',
    'friend_request',
    false,
    '/notifications',
    v_avatar,
    jsonb_build_object('friend_request_id', v_req::text, 'from_user_id', v_me::text)
  );

  RETURN 'request_sent';
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_sender_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO r FROM public.friend_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF r.to_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_friendships (user_a, user_b)
  VALUES (LEAST(r.from_user_id, r.to_user_id), GREATEST(r.from_user_id, r.to_user_id))
  ON CONFLICT DO NOTHING;

  PERFORM public.ensure_follow_edge_internal(r.from_user_id, r.to_user_id);

  DELETE FROM public.friend_requests WHERE id = p_request_id;

  SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(full_name), ''), 'Alguém')
  INTO v_sender_name
  FROM public.profiles
  WHERE user_id = auth.uid();

  INSERT INTO public.notifications (user_id, title, message, type, read, metadata)
  VALUES (
    r.from_user_id,
    v_sender_name,
    'aceitou seu pedido para seguir no Chamô',
    'friend_accepted',
    false,
    jsonb_build_object('other_user_id', auth.uid()::text)
  );
END;
$$;

-- Deixar de seguir remove amizade aceite (app chama removeFriendshipPair no cliente).
CREATE POLICY user_friendships_delete_participant
  ON public.user_friendships FOR DELETE TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

GRANT DELETE ON public.user_friendships TO authenticated;
