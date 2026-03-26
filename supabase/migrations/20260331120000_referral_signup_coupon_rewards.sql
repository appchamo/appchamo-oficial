-- Recompensas de indicação no cadastro:
-- Indicado: +1 cupom de sorteio (além do padrão do trigger) quando o código é válido.
-- Indicador: +1 cupom sorteio + 1 cupom desconto conforme campanha escolhida no admin (platform_settings).

INSERT INTO public.platform_settings (key, value)
VALUES ('referral_referrer_discount_campaign_id', '""'::jsonb)
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

  -- Indicado: cupom extra de sorteio
  INSERT INTO public.coupons (user_id, source, coupon_type, used, discount_percent)
  VALUES (uid, 'bonus', 'raffle', false, 0);

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

  RETURN jsonb_build_object('ok', true, 'invitee_extra_raffle', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
