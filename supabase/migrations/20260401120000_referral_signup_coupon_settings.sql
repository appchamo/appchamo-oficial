-- Cupom de cadastro (indicado): controlado no admin — ativo, % desconto, limite mensal de pacotes (sorteio extra + desconto opcional).
-- Fonte dedicada em coupons para contagem mensal.

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_source_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_source_check CHECK (
    source = ANY (
      ARRAY[
        'registration'::text,
        'payment'::text,
        'bonus'::text,
        'admin'::text,
        'admin_random'::text,
        'referral_signup'::text
      ]
    )
  );

INSERT INTO public.platform_settings (key, value)
VALUES
  ('referral_signup_coupon_active', 'true'::jsonb),
  ('referral_signup_coupon_discount_percent', '"0"'::jsonb),
  ('referral_signup_coupon_monthly_cap', '"10000"'::jsonb)
ON CONFLICT (key) DO NOTHING;

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
  v_campaign_id uuid;
  v_campaign record;
  v_days int;
  v_expires timestamptz;
  v_setting text;
  v_signup_active boolean := true;
  v_signup_pct numeric := 0;
  v_monthly_cap int := 10000;
  v_month_used int := 0;
  v_gave_invitee_raffle boolean := false;
  v_gave_invitee_discount boolean := false;
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

  -- Cupom de cadastro (indicado): sorteio extra + desconto opcional, respeitando limite mensal
  SELECT trim(COALESCE(value #>> '{}', '')) INTO v_raw
  FROM public.platform_settings
  WHERE key = 'referral_signup_coupon_active'
  LIMIT 1;
  IF FOUND THEN
    v_signup_active := lower(COALESCE(v_raw, '')) IN ('true', 't', '1', 'yes');
  END IF;

  SELECT COALESCE(NULLIF(trim(COALESCE(value #>> '{}', '')), '')::numeric, 0) INTO v_signup_pct
  FROM public.platform_settings
  WHERE key = 'referral_signup_coupon_discount_percent'
  LIMIT 1;
  IF v_signup_pct IS NULL OR v_signup_pct < 0 THEN
    v_signup_pct := 0;
  END IF;
  IF v_signup_pct > 100 THEN
    v_signup_pct := 100;
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

      IF v_signup_pct > 0 THEN
        v_days := 30;
        SELECT COALESCE(NULLIF(trim(value #>> '{}'), ''), '30')::int INTO v_days
        FROM public.platform_settings
        WHERE key = 'discount_coupon_validity_days'
        LIMIT 1;
        IF v_days IS NULL OR v_days < 1 THEN
          v_days := 30;
        END IF;
        v_expires := now() + make_interval(days => v_days);

        INSERT INTO public.coupons (
          user_id, source, coupon_type, used, discount_percent, expires_at
        ) VALUES (
          uid,
          'referral_signup',
          'discount',
          false,
          v_signup_pct,
          v_expires
        );
        v_gave_invitee_discount := true;
      END IF;
    END IF;
  END IF;

  -- Indicador: 1 sorteio + 1 desconto (se campanha configurada e ativa)
  INSERT INTO public.coupons (user_id, source, coupon_type, used, discount_percent)
  VALUES (ref_user, 'bonus', 'raffle', false, 0);

  v_campaign_id := NULL;
  SELECT (value #>> '{}') INTO v_setting
  FROM public.platform_settings
  WHERE key = 'referral_referrer_discount_campaign_id'
  LIMIT 1;
  IF v_setting IS NOT NULL
     AND v_setting ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    v_campaign_id := v_setting::uuid;
  END IF;

  IF v_campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign
    FROM public.coupon_campaigns
    WHERE id = v_campaign_id AND is_active IS NOT FALSE
    LIMIT 1;

    IF FOUND AND COALESCE(v_campaign.used_quantity, 0) < v_campaign.total_quantity THEN
      v_days := 30;
      SELECT COALESCE(NULLIF(trim(value #>> '{}'), ''), '30')::int INTO v_days
      FROM public.platform_settings
      WHERE key = 'discount_coupon_validity_days'
      LIMIT 1;
      IF v_days IS NULL OR v_days < 1 THEN
        v_days := 30;
      END IF;
      v_expires := now() + make_interval(days => v_days);

      INSERT INTO public.coupons (
        user_id, source, coupon_type, used, discount_percent, expires_at
      ) VALUES (
        ref_user,
        'bonus',
        'discount',
        false,
        v_campaign.discount_percent::numeric,
        v_expires
      );

      UPDATE public.coupon_campaigns
      SET used_quantity = COALESCE(used_quantity, 0) + 1
      WHERE id = v_campaign_id;
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read, link)
  VALUES (
    ref_user,
    '🎁 Alguém usou seu código de convite!',
    'Você ganhou cupons pelo programa Indique e ganhe. Confira em Meus cupons.',
    'coupon',
    false,
    '/coupons'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invitee_extra_raffle', v_gave_invitee_raffle,
    'invitee_signup_discount', v_gave_invitee_discount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
