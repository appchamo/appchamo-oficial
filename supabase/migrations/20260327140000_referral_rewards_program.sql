-- Programa Indique e ganhe: código único por perfil, indicação e comissão 5% na 1ª assinatura paga

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_invite_code_unique
  ON public.profiles (invite_code)
  WHERE invite_code IS NOT NULL AND btrim(invite_code) <> '';

-- Gera código alfanumérico (8 chars) em novos perfis
CREATE OR REPLACE FUNCTION public.profiles_set_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  c text;
  tries int := 0;
BEGIN
  IF NEW.invite_code IS NOT NULL AND btrim(NEW.invite_code) <> '' THEN
    NEW.invite_code := upper(trim(NEW.invite_code));
    RETURN NEW;
  END IF;
  LOOP
    c := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
    tries := tries + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.invite_code = c);
    EXIT WHEN tries > 50;
  END LOOP;
  IF tries > 50 THEN
    c := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
  END IF;
  NEW.invite_code := c;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_invite_code ON public.profiles;
CREATE TRIGGER trg_profiles_set_invite_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_invite_code();

-- Backfill perfis existentes sem código
DO $$
DECLARE
  r RECORD;
  c text;
  n int;
BEGIN
  FOR r IN SELECT user_id FROM public.profiles WHERE invite_code IS NULL OR btrim(invite_code) = '' LOOP
    n := 0;
    LOOP
      c := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
      n := n + 1;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.invite_code = c);
      EXIT WHEN n > 80;
    END LOOP;
    UPDATE public.profiles SET invite_code = c WHERE user_id = r.user_id;
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN invite_code SET NOT NULL;

-- Quem indicou quem (uma indicação por conta indicada)
CREATE TABLE IF NOT EXISTS public.referral_attributions (
  invitee_user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  referrer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invite_code_used TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer ON public.referral_attributions (referrer_user_id);

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_attr_invitee_read" ON public.referral_attributions;
CREATE POLICY "referral_attr_invitee_read"
  ON public.referral_attributions FOR SELECT TO authenticated
  USING (invitee_user_id = auth.uid());

DROP POLICY IF EXISTS "referral_attr_referrer_read" ON public.referral_attributions;
CREATE POLICY "referral_attr_referrer_read"
  ON public.referral_attributions FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid());

-- Evento de comissão (no máximo um por indicado)
CREATE TABLE IF NOT EXISTS public.referral_commission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  referrer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  charge_brl NUMERIC(10, 2) NOT NULL,
  commission_brl NUMERIC(10, 2) NOT NULL,
  plan_id TEXT NOT NULL,
  wallet_credited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_commission_referrer ON public.referral_commission_events (referrer_user_id);

ALTER TABLE public.referral_commission_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_comm_invitee_read" ON public.referral_commission_events;
CREATE POLICY "referral_comm_invitee_read"
  ON public.referral_commission_events FOR SELECT TO authenticated
  USING (invitee_user_id = auth.uid());

DROP POLICY IF EXISTS "referral_comm_referrer_read" ON public.referral_commission_events;
CREATE POLICY "referral_comm_referrer_read"
  ON public.referral_commission_events FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid());

-- Aplica código de convite (chamado pelo app com JWT do indicado)
CREATE OR REPLACE FUNCTION public.apply_referral_code(p_raw_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  uid uuid := auth.uid();
  code text;
  ref_user uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  code := upper(trim(COALESCE(p_raw_code, '')));
  IF length(code) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_attributions WHERE invitee_user_id = uid) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_applied');
  END IF;

  SELECT user_id INTO ref_user FROM public.profiles WHERE invite_code = code LIMIT 1;
  IF ref_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;
  IF ref_user = uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referral_attributions (invitee_user_id, referrer_user_id, invite_code_used)
  VALUES (uid, ref_user, code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

-- Comissão 5% sobre valor cobrado na assinatura (apenas 1x por indicado; só com cobrança > 0)
CREATE OR REPLACE FUNCTION public.grant_referral_commission_on_paid_subscription(
  p_subscriber_user_id uuid,
  p_charge_amount_brl numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_attr RECORD;
  v_sub RECORD;
  v_new_id uuid;
  v_comm numeric;
  v_prof_id uuid;
BEGIN
  IF p_charge_amount_brl IS NULL OR p_charge_amount_brl <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_charge');
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_subscriber_user_id LIMIT 1;
  IF NOT FOUND OR v_sub.plan_id = 'free' OR upper(COALESCE(v_sub.status, '')) NOT IN ('ACTIVE', 'active') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_active_paid_plan');
  END IF;

  SELECT * INTO v_attr FROM public.referral_attributions WHERE invitee_user_id = p_subscriber_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_referral');
  END IF;

  v_comm := round(p_charge_amount_brl * 0.05, 2);
  IF v_comm < 0.01 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'tiny');
  END IF;

  INSERT INTO public.referral_commission_events (
    invitee_user_id, referrer_user_id, charge_brl, commission_brl, plan_id
  ) VALUES (
    p_subscriber_user_id, v_attr.referrer_user_id, p_charge_amount_brl, v_comm, v_sub.plan_id
  )
  ON CONFLICT (invitee_user_id) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_paid');
  END IF;

  SELECT id INTO v_prof_id
  FROM public.professionals
  WHERE user_id = v_attr.referrer_user_id
  ORDER BY CASE WHEN active THEN 0 ELSE 1 END, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_prof_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'referrer_no_professional_wallet', 'commission_brl', v_comm);
  END IF;

  INSERT INTO public.wallet_transactions (
    professional_id,
    transaction_id,
    gross_amount,
    platform_fee_amount,
    payment_fee_amount,
    anticipation_fee_amount,
    amount,
    payment_method,
    anticipation_enabled,
    description,
    status,
    available_at
  ) VALUES (
    v_prof_id,
    NULL,
    v_comm,
    0,
    0,
    0,
    v_comm,
    'pix',
    false,
    'Comissão Indique e ganhe (5% da 1ª assinatura do indicado)',
    'pending',
    now() + interval '7 days'
  );

  UPDATE public.referral_commission_events
  SET wallet_credited = true
  WHERE invitee_user_id = p_subscriber_user_id;

  RETURN jsonb_build_object('ok', true, 'commission_brl', v_comm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_referral_commission_on_paid_subscription(uuid, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
