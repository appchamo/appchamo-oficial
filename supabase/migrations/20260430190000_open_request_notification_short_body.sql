-- Push / notificação in-app: título fixo; corpo = só a descrição do cliente (sem cidade/categoria no texto).

CREATE OR REPLACE FUNCTION public.trg_notify_professionals_on_open_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, link, read)
  SELECT
    pr.user_id,
    'Novo serviço disponível',
    left(trim(NEW.description), 500),
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
    AND length(trim(NEW.city)) > 0
    AND length(trim(NEW.state)) > 0
    AND upper(
          trim(
            COALESCE(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), '')
          )
        ) = upper(trim(NEW.state))
    AND length(
          trim(
            COALESCE(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), '')
          )
        ) > 0
    AND lower(
          trim(
            COALESCE(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), '')
          )
        ) = lower(trim(NEW.city));

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_notify_professionals_on_open_request() IS
  'Após INSERT em open_service_requests: notifica profissionais (mesma categoria, cidade e UF). message = descrição do pedido.';
