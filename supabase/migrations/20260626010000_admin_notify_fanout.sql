-- Fanout dos alertas de admin nos 3 canais (app/e-mail/WhatsApp), via notify-admins.
-- Estratégia: TODA notificação inserida para a conta admin principal (admin@appchamo.com)
-- dispara a função notify-admins. Como cadastro, pagamento e assinatura JÁ inserem
-- notificação para o admin, ficam cobertos automaticamente. A chamada ganha um gatilho
-- que cria a notificação admin correspondente.

-- 1) Fanout
CREATE OR REPLACE FUNCTION public.trg_admin_notify_fanout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _admin uuid; _secret text;
BEGIN
  SELECT user_id INTO _admin FROM public.profiles WHERE email = 'admin@appchamo.com' LIMIT 1;
  IF _admin IS NULL OR NEW.user_id <> _admin THEN RETURN NEW; END IF;
  SELECT value INTO _secret FROM private.app_config WHERE key = 'email_hook_secret';
  IF _secret IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/notify-admins',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret', _secret),
    body := jsonb_build_object(
      'event',   COALESCE(NEW.type, 'evento'),
      'title',   COALESCE(NEW.title, 'Novo evento no Chamo'),
      'message', COALESCE(NEW.message, ''),
      'link',    COALESCE(NEW.link, '/admin')
    )
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS admin_notify_fanout ON public.notifications;
CREATE TRIGGER admin_notify_fanout
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_notify_fanout();

-- 2) Chamada -> cria notificação admin (que dispara o fanout)
CREATE OR REPLACE FUNCTION public.trg_admin_on_chamada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin uuid;
BEGIN
  IF NEW.type <> 'service_request' THEN RETURN NEW; END IF;
  SELECT user_id INTO _admin FROM public.profiles WHERE email = 'admin@appchamo.com' LIMIT 1;
  IF _admin IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, title, message, type, link, read)
  VALUES (_admin, 'Nova chamada', 'Um cliente abriu uma nova chamada na plataforma.', 'chamada', '/admin', false);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS admin_on_chamada ON public.notifications;
CREATE TRIGGER admin_on_chamada
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_admin_on_chamada();
