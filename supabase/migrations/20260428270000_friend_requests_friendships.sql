-- Amizades explícitas: pedido → aceitar. Não depende de seguir perfil.

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_no_self CHECK (from_user_id IS DISTINCT FROM to_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_outbound
  ON public.friend_requests (from_user_id, to_user_id);

CREATE INDEX IF NOT EXISTS friend_requests_to_user ON public.friend_requests (to_user_id);
CREATE INDEX IF NOT EXISTS friend_requests_from_user ON public.friend_requests (from_user_id);

CREATE TABLE IF NOT EXISTS public.user_friendships (
  user_a uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_friendships_ordered CHECK (user_a < user_b),
  PRIMARY KEY (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS user_friendships_user_b ON public.user_friendships (user_b);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY friend_requests_select_participants
  ON public.friend_requests FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY friend_requests_delete_participant
  ON public.friend_requests FOR DELETE TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY user_friendships_select_participant
  ON public.user_friendships FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

GRANT SELECT, DELETE ON public.friend_requests TO authenticated;
GRANT SELECT ON public.user_friendships TO authenticated;

-- Pedido: notifica destino. Se já existir pedido inverso, vira amizade na hora.
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
    'quer ser seu amigo no Chamô',
    'friend_request',
    false,
    '/profile?friends=1',
    v_avatar,
    jsonb_build_object('friend_request_id', v_req::text, 'from_user_id', v_me::text)
  );

  RETURN 'request_sent';
END;
$$;

ALTER FUNCTION public.send_friend_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.send_friend_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;

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

  DELETE FROM public.friend_requests WHERE id = p_request_id;

  SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(full_name), ''), 'Alguém')
  INTO v_sender_name
  FROM public.profiles
  WHERE user_id = auth.uid();

  INSERT INTO public.notifications (user_id, title, message, type, read, metadata)
  VALUES (
    r.from_user_id,
    v_sender_name,
    'aceitou seu convite de amizade no Chamô',
    'friend_accepted',
    false,
    jsonb_build_object('other_user_id', auth.uid()::text)
  );
END;
$$;

ALTER FUNCTION public.accept_friend_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_friend_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_or_cancel_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO r FROM public.friend_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF r.from_user_id IS DISTINCT FROM auth.uid()
     AND r.to_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.friend_requests WHERE id = p_request_id;
END;
$$;

ALTER FUNCTION public.decline_or_cancel_friend_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decline_or_cancel_friend_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_or_cancel_friend_request(uuid) TO authenticated;
