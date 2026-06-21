-- Fecha assinaturas com cancelamento agendado quando o periodo pago termina.
-- (status -> cancelled, plan -> free). Agendada via pg_cron (hora em hora, minuto 5).
CREATE OR REPLACE FUNCTION public.expire_cancelled_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  UPDATE public.subscriptions
  SET status = 'cancelled', plan_id = 'free'
  WHERE cancel_at_period_end = true
    AND period_ends_at IS NOT NULL
    AND period_ends_at <= now()
    AND status <> 'cancelled';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Agendamento (executado uma vez via SQL, registrado aqui para referencia):
-- SELECT cron.schedule('expire-cancelled-subscriptions','5 * * * *',
--   $$ SELECT public.expire_cancelled_subscriptions(); $$);
