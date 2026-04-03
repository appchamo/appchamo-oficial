-- Ao publicar pedido aberto, notifica profissionais da mesma categoria e UF (perfil).

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
    'Novo pedido na sua categoria',
    COALESCE((SELECT c.name FROM public.categories c WHERE c.id = NEW.category_id LIMIT 1), 'Pedido')
      || ': '
      || left(trim(NEW.description), 150),
    'open_request_new',
    '/pro/pedidos-abertos',
    false
  FROM public.professionals p
  INNER JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE p.category_id = NEW.category_id
    AND p.active = true
    AND p.profile_status = 'approved'
    AND upper(trim(COALESCE(pr.address_state, ''))) = upper(trim(NEW.state))
    AND pr.user_id IS DISTINCT FROM NEW.client_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_notify_professionals_on_open_request() IS
  'Após INSERT em open_service_requests, cria notificação para cada profissional ativo/aprovado da mesma categoria e UF do pedido.';

DROP TRIGGER IF EXISTS trg_open_service_request_notify_pros ON public.open_service_requests;
CREATE TRIGGER trg_open_service_request_notify_pros
  AFTER INSERT ON public.open_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_professionals_on_open_request();
