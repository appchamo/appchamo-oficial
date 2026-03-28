-- Direct-style chats for users who follow a professional: one thread per (client, pro) pair.

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'service';

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_request_kind_check;

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_request_kind_check
  CHECK (request_kind IN ('service', 'following'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_requests_following_unique_pair
  ON public.service_requests (client_id, professional_id)
  WHERE request_kind = 'following';

-- Following DMs must not count toward professional call limits / availability.
CREATE OR REPLACE FUNCTION public.check_professional_call_limit() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $$
DECLARE
  pro_user_id uuid;
  pro_plan_id text;
  call_count integer;
  max_calls_allowed integer;
  bonus integer;
BEGIN
  IF NEW.request_kind IS NOT DISTINCT FROM 'following' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, bonus_calls INTO pro_user_id, bonus FROM professionals WHERE id = NEW.professional_id;
  IF pro_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT plan_id INTO pro_plan_id FROM subscriptions WHERE user_id = pro_user_id;
  IF pro_plan_id IS NULL THEN pro_plan_id := 'free'; END IF;

  SELECT max_calls INTO max_calls_allowed FROM plans WHERE id = pro_plan_id;
  IF max_calls_allowed IS NULL OR max_calls_allowed = -1 THEN RETURN NEW; END IF;

  max_calls_allowed := max_calls_allowed + COALESCE(bonus, 0);

  SELECT count(*) INTO call_count
  FROM service_requests
  WHERE professional_id = NEW.professional_id
    AND (request_kind IS DISTINCT FROM 'following');

  IF call_count >= max_calls_allowed THEN
    UPDATE professionals SET availability_status = 'unavailable' WHERE id = NEW.professional_id;
  END IF;

  RETURN NEW;
END;
$$;

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
  ) THEN
    RAISE EXCEPTION 'must follow this professional to open a direct message';
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

ALTER FUNCTION public.ensure_following_direct_thread(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ensure_following_direct_thread(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_following_direct_thread(uuid) TO authenticated;
