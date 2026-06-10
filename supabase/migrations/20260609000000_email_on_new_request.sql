-- E-mail ao profissional quando recebe nova chamada (direta = service_request, ou pedido aberto = open_request_new).
-- O valor do secret (email_hook_secret) é inserido FORA desta migration (não vai pro git).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE OR REPLACE FUNCTION public.trg_email_on_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _secret text;
BEGIN
  IF NEW.type NOT IN ('service_request', 'open_request_new') THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _secret FROM private.app_config WHERE key = 'email_hook_secret';
  IF _secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/send-request-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeGVpdXF4enJsbnZsb3BjcndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzUyNDIsImV4cCI6MjA4NzY1MTI0Mn0.r91_46_RmHVGtq3e_i4PWTbDHLhxMyvVuqzUO1yNjJQ',
      'x-hook-secret', _secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'link', NEW.link
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_on_request_notification ON public.notifications;
CREATE TRIGGER email_on_request_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_email_on_request_notification();
