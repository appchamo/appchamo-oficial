-- Indica se o utilizador autenticado (com perfil profissional) tem seguimento mútuo com o dono deste perfil profissional.

CREATE OR REPLACE FUNCTION public.professional_is_mutual_with_viewer(p_professional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professionals p_target
    INNER JOIN public.professional_follows f_me
      ON f_me.user_id = auth.uid()
      AND f_me.professional_id = p_target.id
    INNER JOIN public.professionals p_viewer
      ON p_viewer.user_id = auth.uid()
    INNER JOIN public.professional_follows f_back
      ON f_back.user_id = p_target.user_id
      AND f_back.professional_id = p_viewer.id
    WHERE p_target.id = p_professional_id
  );
$$;

ALTER FUNCTION public.professional_is_mutual_with_viewer(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.professional_is_mutual_with_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.professional_is_mutual_with_viewer(uuid) TO authenticated;
