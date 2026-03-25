-- Comissão Indique e ganhe: fica "a receber" (pending) por 7 dias antes de liberar repasse
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

NOTIFY pgrst, 'reload schema';
