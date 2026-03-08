-- Notifica o admin (admin@appchamo.com) quando:
-- 1) Uma assinatura for criada/atualizada com status PENDING (aguardando análise).

CREATE OR REPLACE FUNCTION public.notify_admin_subscription_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _admin_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'PENDING' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO _admin_id
  FROM profiles p
  WHERE p.email = 'admin@appchamo.com'
  LIMIT 1;

  IF _admin_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, link)
    VALUES (
      _admin_id,
      'Assinatura aguardando análise',
      'Um profissional assinou um plano e está aguardando aprovação. Aprove o mais rápido possível.',
      'admin',
      '/admin/pros'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_subscription_pending ON public.subscriptions;
CREATE TRIGGER trg_notify_admin_subscription_pending
  AFTER INSERT OR UPDATE OF status
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_subscription_pending();
