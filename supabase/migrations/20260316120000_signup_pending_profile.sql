-- Perfil criado no trigger NÃO é considerado "registrado" até o usuário concluir a última etapa do signup.
-- Novos usuários (OAuth ou email) recebem user_type = 'pending_signup'; complete-signup atualiza para client/professional.

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
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''), 'pending_signup')
  );
  RETURN NEW;
END;
$$;
