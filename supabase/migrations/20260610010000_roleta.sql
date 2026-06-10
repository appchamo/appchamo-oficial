-- Roleta de prêmios (estilo Shopee/Temu).
-- Dois gatilhos:
--   • 'payment' → cada pagamento confirmado do cliente concede 1 giro (grant). Anti-fraude:
--      o giro só é criado pelo webhook (service_role), 1 por transação. O cliente apenas consome.
--   • 'login'   → 1 giro por dia no primeiro acesso (controlado pelo servidor por data, fuso SP).
-- Sorteio é feito SEMPRE no servidor (ponderado). O cliente nunca decide o prêmio.

-- ── Giros concedidos por pagamento (a consumir) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.roleta_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'payment',
  transaction_id uuid UNIQUE,           -- 1 giro por transação (idempotente)
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roleta_grants_user_open
  ON public.roleta_grants (user_id) WHERE consumed = false;

ALTER TABLE public.roleta_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_grants_read" ON public.roleta_grants;
CREATE POLICY "own_grants_read" ON public.roleta_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── Histórico de giros (log + controle do giro diário de login) ──────────────
CREATE TABLE IF NOT EXISTS public.roleta_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL,                -- 'payment' | 'login'
  prize text NOT NULL,                  -- 'raffle' | 'discount_2' | 'discount_5' | 'discount_10'
  coupon_id uuid,
  grant_id uuid,
  spin_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roleta_spins_user ON public.roleta_spins (user_id, trigger, spin_date);

ALTER TABLE public.roleta_spins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_spins_read" ON public.roleta_spins;
CREATE POLICY "own_spins_read" ON public.roleta_spins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── O que o usuário tem disponível para girar ────────────────────────────────
CREATE OR REPLACE FUNCTION public.roleta_pending()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  pay_count int := 0;
  login_used boolean := false;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('payment', 0, 'login', false); END IF;

  SELECT count(*) INTO pay_count
  FROM public.roleta_grants
  WHERE user_id = uid AND consumed = false AND trigger = 'payment';

  SELECT EXISTS(
    SELECT 1 FROM public.roleta_spins
    WHERE user_id = uid AND trigger = 'login' AND spin_date = today
  ) INTO login_used;

  RETURN jsonb_build_object('payment', pay_count, 'login', NOT login_used);
END;
$$;

-- ── Sorteio ponderado (server-side) + criação de cupom ───────────────────────
-- Pesos: sorteio comum, desconto alto raro.
--   payment: raffle(60) | discount_5(30) | discount_10(10)
--   login:   raffle(60) | discount_2(30) | discount_5(10)
CREATE OR REPLACE FUNCTION public.roleta_spin(p_trigger text, p_grant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  g public.roleta_grants%ROWTYPE;
  r int;
  prize text;
  disc numeric := NULL;
  new_coupon_id uuid := NULL;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_trigger NOT IN ('payment', 'login') THEN RAISE EXCEPTION 'invalid_trigger'; END IF;

  -- Validação do gatilho (anti-fraude)
  IF p_trigger = 'login' THEN
    IF EXISTS (SELECT 1 FROM public.roleta_spins WHERE user_id = uid AND trigger = 'login' AND spin_date = today) THEN
      RAISE EXCEPTION 'no_spin_available';
    END IF;
  ELSE
    -- payment: precisa de um grant válido e não consumido
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

  -- Sorteio ponderado 1..100
  r := floor(random() * 100) + 1;  -- 1..100
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

  -- Cria o cupom
  IF prize = 'raffle' THEN
    INSERT INTO public.coupons (user_id, source, coupon_type)
    VALUES (uid, 'bonus', 'raffle')
    RETURNING id INTO new_coupon_id;
  ELSE
    INSERT INTO public.coupons (user_id, source, coupon_type, discount_percent, expires_at)
    VALUES (uid, 'bonus', 'discount', disc, now() + interval '30 days')
    RETURNING id INTO new_coupon_id;
  END IF;

  INSERT INTO public.roleta_spins (user_id, trigger, prize, coupon_id, grant_id)
  VALUES (uid, p_trigger, prize, new_coupon_id, g.id);

  RETURN jsonb_build_object(
    'prize', prize,
    'discount', disc,
    'coupon_id', new_coupon_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.roleta_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.roleta_spin(text, uuid) TO authenticated;
