-- WhatsApp (Cloud API oficial) no recebimento de chamada direta.
-- Dispara o template "nova_chamada" pro WhatsApp do profissional quando entra
-- uma notificação do tipo service_request. Só chamada direta (não open_request_new),
-- pra evitar disparo em massa. A função send-whatsapp resolve o telefone/nome do perfil.
CREATE OR REPLACE FUNCTION public.trg_whatsapp_on_service_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _secret text;
BEGIN
  IF NEW.type <> 'service_request' THEN
    RETURN NEW;
  END IF;
  SELECT value INTO _secret FROM private.app_config WHERE key = 'email_hook_secret';
  IF _secret IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', _secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'template', 'nova_chamada',
      'lang', 'pt_BR'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_on_service_request ON public.notifications;
CREATE TRIGGER whatsapp_on_service_request
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_whatsapp_on_service_request();
