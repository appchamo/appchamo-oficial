-- Cria perfil automaticamente como "client" para novos usuários (OAuth/email).
-- Captura nome + email e já libera acesso à Home sem passar por pending_signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    full_name,
    user_type
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''), 'client')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    user_type = EXCLUDED.user_type;

  RETURN NEW;
END;
$$;

