-- Corrige notificações de pedido aberto: categoria via profession_id + UF em profiles OU profile_private;
-- se o profissional não tiver UF no perfil, ainda recebe (mesma categoria), para não ficar sem aviso.

CREATE OR REPLACE FUNCTION public.trg_notify_professionals_on_open_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_name text;
BEGIN
  SELECT c.name INTO v_cat_name
  FROM public.categories c
  WHERE c.id = NEW.category_id
  LIMIT 1;

  INSERT INTO public.notifications (user_id, title, message, type, link, read)
  SELECT
    pr.user_id,
    'Novo serviço disponível',
    'Confira pedidos abertos na sua categoria'
      || CASE
           WHEN v_cat_name IS NOT NULL AND length(trim(v_cat_name)) > 0
             THEN ' (' || trim(v_cat_name) || ')'
           ELSE ''
         END
      || '. '
      || left(trim(NEW.description), 130),
    'open_request_new',
    '/pro/pedidos-abertos',
    false
  FROM public.professionals p
  INNER JOIN public.profiles pr ON pr.user_id = p.user_id
  LEFT JOIN public.profile_private pp ON pp.user_id = p.user_id
  WHERE
    (
      p.category_id = NEW.category_id
      OR EXISTS (
        SELECT 1
        FROM public.professions pf
        WHERE pf.id = p.profession_id
          AND pf.category_id = NEW.category_id
      )
    )
    AND p.active = true
    AND p.profile_status = 'approved'
    AND pr.user_id IS DISTINCT FROM NEW.client_id
    AND (
      NULLIF(
        upper(
          trim(
            COALESCE(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), '')
          )
        ),
        ''
      ) IS NULL
      OR upper(
        trim(
          COALESCE(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), '')
        )
      ) = upper(trim(NEW.state))
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_notify_professionals_on_open_request() IS
  'Após INSERT em open_service_requests: notifica profissionais aprovados da mesma categoria (category_id ou profession→category), mesma UF se preenchida no perfil; sem UF no perfil, notifica na mesma categoria (evita silêncio).';

DROP TRIGGER IF EXISTS trg_open_service_request_notify_pros ON public.open_service_requests;
CREATE TRIGGER trg_open_service_request_notify_pros
  AFTER INSERT ON public.open_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_professionals_on_open_request();
