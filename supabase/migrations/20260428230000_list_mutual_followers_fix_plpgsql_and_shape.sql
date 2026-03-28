-- Lista de amigos mútuos: mesma lógica que count_professional_mutual_followers, sem JOIN em profiles
-- (evita linhas “perdidas” e ambiguidades de RLS). Nomes/avatars são enriquecidos no cliente.
-- Colunas com prefixo friend_* para evitar sombra de variáveis OUT em PL/pgSQL (ex.: user_id).
--
-- DROP obrigatório: em PostgreSQL não se pode mudar o tipo de retorno (OUT) com CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.list_professional_mutual_followers(uuid);

CREATE FUNCTION public.list_professional_mutual_followers(p_professional_id uuid)
RETURNS TABLE (
  friend_user_id uuid,
  friend_full_name text,
  friend_avatar_url text,
  friend_pro_key text
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
    'Profissional'::text,
    NULL::text,
    COALESCE(NULLIF(TRIM(p_follower.slug), ''), p_follower.id::text)::text
  FROM public.professional_follows f_in
  INNER JOIN public.professionals p_follower ON p_follower.user_id = f_in.user_id
  INNER JOIN public.professional_follows f_back
    ON f_back.user_id = owner_uid
    AND f_back.professional_id = p_follower.id
  WHERE f_in.professional_id = p_professional_id
  ORDER BY 4;
END;
$$;

ALTER FUNCTION public.list_professional_mutual_followers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_professional_mutual_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_professional_mutual_followers(uuid) TO authenticated;
