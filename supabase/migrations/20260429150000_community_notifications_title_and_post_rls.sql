-- 1) Reações/comentários: notificações.title vinha NULL quando não havia linha em profiles
--    (SELECT INTO deixa variáveis NULL) → viola NOT NULL em notifications.title.
-- 2) Publicar na comunidade: RLS só lia user_type em profiles; profissionais com perfil
--    desatualizado (ex.: ainda 'client') mas com professionals aprovado falhavam o INSERT.

CREATE OR REPLACE FUNCTION public._community_actor_profile(_uid uuid)
RETURNS TABLE (display_name text, avatar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      NULLIF(trim(pr.display_name), ''),
      NULLIF(trim(pr.full_name), ''),
      'Alguém'
    ) AS display_name,
    NULLIF(trim(pr.avatar_url), '') AS avatar
  FROM public.profiles pr
  WHERE pr.user_id = _uid
  UNION ALL
  SELECT 'Alguém'::text, NULL::text
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr2 WHERE pr2.user_id = _uid)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_professional_or_company_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _uid
      AND p.user_type IN ('professional', 'company')
  )
  OR EXISTS (
    SELECT 1
    FROM public.professionals pr
    WHERE pr.user_id = _uid
      AND pr.profile_status = 'approved'
      AND pr.active = true
  );
$$;

COMMENT ON FUNCTION public._community_actor_profile(uuid) IS
  'Nome e avatar para notificações da comunidade; sempre devolve uma linha (fallback Alguém).';
COMMENT ON FUNCTION public.is_professional_or_company_user(uuid) IS
  'True se profiles.user_type é professional/company OU existe linha professionals aprovada e ativa.';

NOTIFY pgrst, 'reload schema';
