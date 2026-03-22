-- Função RPC para "reivindicar" um push_token: remove-o de qualquer outro usuário.
-- Necessário porque a RLS impede que um usuário delete linhas de outro user_id diretamente.
-- SECURITY DEFINER: roda com privilégios do owner (postgres), bypassa RLS.
CREATE OR REPLACE FUNCTION public.claim_device_token(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove este push_token de todos os usuários EXCETO o que está chamando a função
  DELETE FROM public.user_devices
  WHERE push_token = p_token
    AND user_id IS DISTINCT FROM auth.uid();
END;
$$;

-- Garante que apenas usuários autenticados podem chamar esta função
REVOKE ALL ON FUNCTION public.claim_device_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_device_token(TEXT) TO authenticated;
