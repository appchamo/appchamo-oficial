-- Roleta: giro gratis 1x por semana (era diario) + cupom de desconto valido 24h (era 30 dias).
-- O giro por pagamento e o premio de sorteio continuam iguais.

CREATE OR REPLACE FUNCTION public.roleta_pending()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pay_count int := 0;
  week_used boolean := false;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('payment', 0, 'login', false); END IF;

  SELECT count(*) INTO pay_count
  FROM public.roleta_grants
  WHERE user_id = uid AND consumed = false AND trigger = 'payment';

  -- Giro gratis: 1x a cada 7 dias
  SELECT EXISTS(
    SELECT 1 FROM public.roleta_spins
    WHERE user_id = uid AND trigger = 'login' AND created_at > now() - interval '7 days'
  ) INTO week_used;

  RETURN jsonb_build_object('payment', pay_count, 'login', NOT week_used);
END;
$$;

CREATE OR REPLACE FUNCTION public.roleta_spin(p_trigger text, p_grant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  g public.roleta_grants%ROWTYPE;
  r int;
  prize text;
  disc numeric := NULL;
  new_coupon_id uuid := NULL;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_trigger NOT IN ('payment', 'login') THEN RAISE EXCEPTION 'invalid_trigger'; END IF;

  IF p_trigger = 'login' THEN
    IF EXISTS (
      SELECT 1 FROM public.roleta_spins
      WHERE user_id = uid AND trigger = 'login' AND created_at > now() - interval '7 days'
    ) THEN
      RAISE EXCEPTION 'no_spin_available';
    END IF;
  ELSE
    IF p_grant_id IS NOT NULL THEN
      SELECT * INTO g FROM public.roleta_grants
        WHERE id = p_grant_id AND user_id = uid AND consumed = false AND trigger = 'payment'
        FOR UPDATE;
    ELSE
      SELECT * INTO g FROM public.roleta_grants
        WHERE user_id = uid AND consumed = false AND trigger = 'payment'
        ORDER BY created_at ASC LIMIT 1
        FOR UPDATE;
    END IF;
    IF g.id IS NULL THEN RAISE EXCEPTION 'no_spin_available'; END IF;
    UPDATE public.roleta_grants SET consumed = true WHERE id = g.id;
  END IF;

  r := floor(random() * 100) + 1;
  IF p_trigger = 'payment' THEN
    IF r <= 60 THEN prize := 'raffle';
    ELSIF r <= 90 THEN prize := 'discount_5'; disc := 5;
    ELSE prize := 'discount_10'; disc := 10;
    END IF;
  ELSE
    IF r <= 60 THEN prize := 'raffle';
    ELSIF r <= 90 THEN prize := 'discount_2'; disc := 2;
    ELSE prize := 'discount_5'; disc := 5;
    END IF;
  END IF;

  IF prize = 'raffle' THEN
    INSERT INTO public.coupons (user_id, source, coupon_type)
    VALUES (uid, 'bonus', 'raffle')
    RETURNING id INTO new_coupon_id;
  ELSE
    -- Cupom de desconto: valido por 24h
    INSERT INTO public.coupons (user_id, source, coupon_type, discount_percent, expires_at)
    VALUES (uid, 'bonus', 'discount', disc, now() + interval '24 hours')
    RETURNING id INTO new_coupon_id;
  END IF;

  INSERT INTO public.roleta_spins (user_id, trigger, prize, coupon_id, grant_id)
  VALUES (uid, p_trigger, prize, new_coupon_id, g.id);

  RETURN jsonb_build_object('prize', prize, 'discount', disc, 'coupon_id', new_coupon_id);
END;
$$;
