-- Comparação case-insensitive + trim; evita falsos negativos e alinha com o e-mail normalizado no app.
CREATE OR REPLACE FUNCTION public.check_email_exists(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF user_email IS NULL OR btrim(user_email) = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE lower(btrim(email)) = lower(btrim(user_email))
  );
END;
$$;
