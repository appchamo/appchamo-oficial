-- Garante linha em professionals (pendente) sempre que o perfil vira profissional.
-- Corrige casos em que user_type = professional existia sem registro em professionals
-- (ex.: fluxos antigos), para o admin ver em "Profissionais" e o app respeitar análise.

CREATE OR REPLACE FUNCTION public.sync_professional_row_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.user_type IS DISTINCT FROM 'professional' THEN
    RETURN NEW;
  END IF;
  -- Já era profissional: não sobrescrever status ao atualizar nome/telefone etc.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.user_type, '') = 'professional' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.professionals (user_id, profile_status, active)
  VALUES (NEW.user_id, 'pending', false)
  ON CONFLICT (user_id) DO UPDATE SET
    profile_status = CASE
      WHEN professionals.profile_status = 'approved' THEN professionals.profile_status
      ELSE 'pending'
    END,
    active = CASE
      WHEN professionals.profile_status = 'approved' THEN professionals.active
      ELSE false
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_professional_row ON public.profiles;
CREATE TRIGGER trg_sync_professional_row
  AFTER INSERT OR UPDATE OF user_type ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_professional_row_from_profile();

-- Perfis já marcados como profissional sem linha em professionals
INSERT INTO public.professionals (user_id, profile_status, active)
SELECT p.user_id, 'pending', false
FROM public.profiles p
WHERE p.user_type = 'professional'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.user_id);
