-- Lista de amigos mútuos como JSON único — evita problemas de serialização do PostgREST com RETURNS TABLE.
-- Mesma lógica que count_professional_mutual_followers.

DROP FUNCTION IF EXISTS public.get_professional_mutual_friends_json(uuid);

CREATE FUNCTION public.get_professional_mutual_friends_json(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid uuid;
  result jsonb;
BEGIN
  SELECT p.user_id INTO owner_uid FROM public.professionals p WHERE p.id = p_professional_id LIMIT 1;
  IF owner_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  IF auth.uid() IS DISTINCT FROM owner_uid AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(j ORDER BY j->>'pro_key')
      FROM (
        SELECT jsonb_build_object(
          'user_id', p_follower.user_id,
          'pro_key', COALESCE(NULLIF(TRIM(p_follower.slug), ''), p_follower.id::text)
        ) AS j
        FROM public.professional_follows f_in
        INNER JOIN public.professionals p_follower ON p_follower.user_id = f_in.user_id
        INNER JOIN public.professional_follows f_back
          ON f_back.user_id = owner_uid
          AND f_back.professional_id = p_follower.id
        WHERE f_in.professional_id = p_professional_id
      ) q
    ),
    '[]'::jsonb
  )
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

ALTER FUNCTION public.get_professional_mutual_friends_json(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_professional_mutual_friends_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_mutual_friends_json(uuid) TO authenticated;
