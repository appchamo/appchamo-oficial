-- Notificação ao conquistar selo + leitura pública de selos (home / perfil).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.metadata IS 'Payload extra (ex.: seal_award: seal_id, icon_variant).';

-- Lista selos concedidos para exibição pública (anon + authenticated).
CREATE OR REPLACE FUNCTION public.public_professional_seals(p_ids uuid[])
RETURNS TABLE (
  professional_id uuid,
  seal_id uuid,
  title text,
  icon_variant text,
  sort_order integer,
  is_special boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    a.professional_id,
    a.seal_id,
    d.title,
    d.icon_variant,
    d.sort_order,
    d.is_special
  FROM public.professional_seals_awarded a
  INNER JOIN public.professional_seal_definitions d ON d.id = a.seal_id AND d.is_active IS TRUE
  INNER JOIN public.professionals p ON p.id = a.professional_id AND p.profile_status = 'approved'
  WHERE cardinality(p_ids) > 0
    AND a.professional_id = ANY (p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.public_professional_seals(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.public_professional_seals(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.public_professional_seals(uuid[]) IS 'Selos ativos concedidos a profissionais aprovados — para home e perfil público.';

CREATE OR REPLACE FUNCTION public.notify_professional_seal_awarded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_slug text;
  v_icon text;
BEGIN
  SELECT p.user_id, d.title, d.slug, d.icon_variant
  INTO v_user_id, v_title, v_slug, v_icon
  FROM public.professionals p
  JOIN public.professional_seal_definitions d ON d.id = NEW.seal_id
  WHERE p.id = NEW.professional_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    read,
    link,
    metadata
  )
  VALUES (
    v_user_id,
    'Parabéns! Novo selo no Chamô',
    format(
      'Você recebeu o %s no Chamô. Continue crescendo — cada conquista conta!',
      v_title
    ),
    'seal_award',
    false,
    '/pro',
    jsonb_build_object(
      'seal_id', NEW.seal_id,
      'seal_title', v_title,
      'seal_slug', v_slug,
      'icon_variant', COALESCE(v_icon, 'seal_default')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_professional_seal_awarded ON public.professional_seals_awarded;
CREATE TRIGGER trg_notify_professional_seal_awarded
  AFTER INSERT ON public.professional_seals_awarded
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_professional_seal_awarded();

COMMENT ON FUNCTION public.notify_professional_seal_awarded() IS 'Envia notificação in-app quando um selo é concedido (automático ou manual).';

NOTIFY pgrst, 'reload schema';
