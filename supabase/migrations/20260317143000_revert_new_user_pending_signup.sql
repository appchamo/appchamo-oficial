-- Reverte a criação automática de novos usuários como "client".
-- Novo usuário (OAuth/email) entra como pending_signup e só vira client/professional após concluir o signup.

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

