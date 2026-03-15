-- Novos usuários (Google, Apple, email) passam a ser criados como 'client'.
-- Quem entra sem cadastro vai direto para a Home como cliente; complete-signup continua definindo professional quando o usuário escolher.

UPDATE public.profiles SET user_type = 'client' WHERE user_type = 'pending_signup';

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
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''), 'client')
  );
  RETURN NEW;
END;
$$;
