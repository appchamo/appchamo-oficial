-- Indique e ganhe: apenas cupom de sorteio para indicado e indicador (sem cupom de desconto por código).

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
  v_signup_active boolean := true;
  v_monthly_cap int := 10000;
  v_month_used int := 0;
  v_gave_invitee_raffle boolean := false;
  v_raw text;
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

  -- Indicado: +1 cupom de sorteio (opcional limite mensal), sem desconto
  SELECT trim(COALESCE(value #>> '{}', '')) INTO v_raw
  FROM public.platform_settings
  WHERE key = 'referral_signup_coupon_active'
  LIMIT 1;
  IF FOUND THEN
    v_signup_active := lower(COALESCE(v_raw, '')) IN ('true', 't', '1', 'yes');
  END IF;

  SELECT COALESCE(NULLIF(trim(COALESCE(value #>> '{}', '')), '')::int, 10000) INTO v_monthly_cap
  FROM public.platform_settings
  WHERE key = 'referral_signup_coupon_monthly_cap'
  LIMIT 1;
  IF v_monthly_cap IS NULL OR v_monthly_cap < 0 THEN
    v_monthly_cap := 0;
  END IF;

  IF v_signup_active AND v_monthly_cap > 0 THEN
    SELECT COUNT(DISTINCT c.user_id) INTO v_month_used
    FROM public.coupons c
    WHERE c.source = 'referral_signup'
      AND c.coupon_type = 'raffle'
      AND c.created_at >= date_trunc('month', (now() AT TIME ZONE 'utc'));

    IF v_month_used < v_monthly_cap THEN
      INSERT INTO public.coupons (user_id, source, coupon_type, used, discount_percent)
      VALUES (uid, 'referral_signup', 'raffle', false, 0);
      v_gave_invitee_raffle := true;
    END IF;
  END IF;

  -- Indicador: +1 cupom de sorteio
  INSERT INTO public.coupons (user_id, source, coupon_type, used, discount_percent)
  VALUES (ref_user, 'bonus', 'raffle', false, 0);

  IF v_gave_invitee_raffle THEN
    INSERT INTO public.notifications (user_id, title, message, type, read, link)
    VALUES (
      ref_user,
      '🎁 Alguém usou seu código de convite!',
      'Você ganhou +1 cupom para o sorteio mensal. Quem se cadastrou com seu código também recebeu +1 cupom de sorteio. Confira em Meus cupons.',
      'coupon',
      false,
      '/coupons'
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, message, type, read, link)
    VALUES (
      ref_user,
      '🎁 Alguém usou seu código de convite!',
      'Você ganhou +1 cupom para o sorteio mensal do Indique e ganhe. Confira em Meus cupons.',
      'coupon',
      false,
      '/coupons'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invitee_extra_raffle', v_gave_invitee_raffle,
    'invitee_signup_discount', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
