-- Parcelas na transação (para cálculo de antecipação modo mensal, alinhado ao create_payment).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installment_count integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.transactions.installment_count IS
  'Nº de parcelas no cartão (1 à vista). Usado ao solicitar antecipação depois do pagamento.';

-- Cópia na carteira para o app calcular taxa no modal sem depender de RLS em transactions.
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS installment_count integer NOT NULL DEFAULT 1;

UPDATE public.wallet_transactions w
SET installment_count = GREATEST(1, COALESCE(t.installment_count, 1))
FROM public.transactions t
WHERE w.transaction_id = t.id
  AND (w.installment_count IS NULL OR w.installment_count = 1);

-- Profissional solicita antecipação para repasse de cartão criado sem antecipação.
CREATE OR REPLACE FUNCTION public.request_wallet_card_anticipation(p_wallet_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wt public.wallet_transactions%ROWTYPE;
  v_mode text;
  v_monthly numeric;
  v_simple_pct numeric;
  v_ant numeric;
  v_days int;
  v_gross numeric;
  v_inst int;
  v_tx_inst int;
  v_new_net numeric;
  v_new_available timestamptz;
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT wt.* INTO v_wt
  FROM public.wallet_transactions wt
  INNER JOIN public.professionals p ON p.id = wt.professional_id AND p.user_id = v_uid
  WHERE wt.id = p_wallet_transaction_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_wt.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;
  IF lower(trim(COALESCE(v_wt.payment_method, ''))) IS DISTINCT FROM 'card' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_card');
  END IF;
  IF COALESCE(v_wt.anticipation_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_anticipated');
  END IF;

  v_gross := COALESCE(
    v_wt.gross_amount,
    v_wt.amount + COALESCE(v_wt.platform_fee_amount, 0) + COALESCE(v_wt.payment_fee_amount, 0)
  );
  IF v_gross IS NULL OR v_gross <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gross');
  END IF;

  v_inst := GREATEST(1, COALESCE(v_wt.installment_count, 1));
  IF v_wt.transaction_id IS NOT NULL THEN
    SELECT installment_count INTO v_tx_inst FROM public.transactions WHERE id = v_wt.transaction_id;
    IF FOUND AND COALESCE(v_tx_inst, 0) >= 1 THEN
      v_inst := GREATEST(1, v_tx_inst);
    END IF;
  END IF;

  SELECT lower(trim(COALESCE(value #>> '{}', 'simple'))) INTO v_mode
  FROM public.platform_settings WHERE key = 'anticipation_mode' LIMIT 1;

  SELECT COALESCE(NULLIF(trim(value #>> '{}'), '')::numeric, 1.15) INTO v_monthly
  FROM public.platform_settings WHERE key = 'anticipation_monthly_rate' LIMIT 1;

  SELECT COALESCE(NULLIF(trim(value #>> '{}'), '')::numeric, 3.5) INTO v_simple_pct
  FROM public.platform_settings WHERE key = 'anticipation_fee_pct' LIMIT 1;

  IF v_mode = 'monthly' THEN
    v_ant := round(v_gross * v_monthly / 100.0 * v_inst, 2);
  ELSE
    v_ant := round(v_gross * v_simple_pct / 100.0, 2);
  END IF;

  v_new_net := round(COALESCE(v_wt.amount, 0) - COALESCE(v_ant, 0), 2);
  IF v_new_net < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_net');
  END IF;

  SELECT COALESCE(NULLIF(trim(value #>> '{}'), '')::int, 4) INTO v_days
  FROM public.platform_settings WHERE key = 'transfer_period_card_anticipated_days' LIMIT 1;
  IF v_days IS NULL OR v_days < 1 THEN
    v_days := 4;
  END IF;

  v_new_available := now() + make_interval(days => v_days);

  UPDATE public.wallet_transactions wt
  SET
    anticipation_enabled = true,
    anticipation_fee_amount = v_ant,
    amount = v_new_net,
    available_at = v_new_available
  WHERE wt.id = v_wt.id
    AND wt.status = 'pending'
    AND lower(trim(COALESCE(wt.payment_method, ''))) = 'card'
    AND COALESCE(wt.anticipation_enabled, false) = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'concurrent_update');
  END IF;

  IF v_wt.transaction_id IS NOT NULL THEN
    UPDATE public.transactions
    SET
      anticipation_enabled = true,
      professional_net = v_new_net,
      platform_fee = round(
        COALESCE(commission_fee, v_wt.platform_fee_amount, 0)
        + COALESCE(payment_fee, v_wt.payment_fee_amount, 0)
        + v_ant,
        2
      )
    WHERE id = v_wt.transaction_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'anticipation_fee', v_ant,
    'new_net', v_new_net,
    'available_at', v_new_available,
    'installments_used', v_inst
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_wallet_card_anticipation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
