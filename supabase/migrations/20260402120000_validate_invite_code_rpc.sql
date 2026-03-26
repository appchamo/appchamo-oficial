-- Valida se o código de convite existe (perfil de outro usuário), sem criar indicação.
-- Usado no cadastro no botão "Aplicar". Anônimo e autenticado (e-mail ainda sem perfil completo).

CREATE OR REPLACE FUNCTION public.validate_invite_code(p_raw_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  code text;
  ref_user uuid;
  uid uuid := auth.uid();
BEGIN
  code := upper(trim(COALESCE(p_raw_code, '')));
  IF length(code) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  SELECT user_id INTO ref_user
  FROM public.profiles
  WHERE invite_code = code
  LIMIT 1;

  IF ref_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF uid IS NOT NULL AND ref_user = uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
