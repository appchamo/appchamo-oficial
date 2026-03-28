-- Lista amigos (seguimento mútuo entre perfis profissionais) para o dono do perfil.

CREATE OR REPLACE FUNCTION public.list_professional_mutual_followers(p_professional_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  pro_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid uuid;
BEGIN
  SELECT p.user_id INTO owner_uid FROM public.professionals p WHERE p.id = p_professional_id LIMIT 1;
  IF owner_uid IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS DISTINCT FROM owner_uid AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p_follower.user_id,
    COALESCE(NULLIF(TRIM(pr.display_name), ''), NULLIF(TRIM(pr.full_name), ''), 'Profissional')::text AS full_name,
    pr.avatar_url,
    COALESCE(NULLIF(TRIM(p_follower.slug), ''), p_follower.id::text)::text AS pro_key
  FROM public.professional_follows f_in
  INNER JOIN public.professionals p_follower ON p_follower.user_id = f_in.user_id
  INNER JOIN public.professional_follows f_back
    ON f_back.user_id = owner_uid
    AND f_back.professional_id = p_follower.id
  INNER JOIN public.profiles pr ON pr.user_id = p_follower.user_id
  WHERE f_in.professional_id = p_professional_id
  ORDER BY full_name;
END;
$$;

ALTER FUNCTION public.list_professional_mutual_followers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_professional_mutual_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_professional_mutual_followers(uuid) TO authenticated;
