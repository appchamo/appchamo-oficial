-- Cria wallet_transactions faltando para transações completed sem entrada na carteira
-- Corrige a condição de corrida: polling marcava status=completed antes do webhook criar wallet_transaction

DO $$
DECLARE
  v_commission_pct   NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'commission_pct'), 10);
  v_pix_fee_pct      NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'pix_fee_pct'), 0);
  v_pix_fee_fixed    NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'pix_fee_fixed'), 0);
  v_pix_hours        NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'transfer_period_pix_hours'), 12);

  v_tx RECORD;
  v_commission_fee   NUMERIC;
  v_payment_fee      NUMERIC;
  v_professional_net NUMERIC;
  v_original_amount  NUMERIC;
BEGIN
  FOR v_tx IN
    SELECT
      t.id,
      t.professional_id,
      t.total_amount,
      COALESCE(t.original_amount, t.total_amount) AS original_amount,
      t.professional_net,
      t.commission_fee,
      t.payment_fee
    FROM public.transactions t
    WHERE t.status = 'completed'
      AND t.professional_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions wt WHERE wt.transaction_id = t.id
      )
  LOOP
    v_original_amount  := v_tx.original_amount;

    -- Usa valores já calculados se disponíveis
    v_commission_fee   := COALESCE(NULLIF(v_tx.commission_fee, 0),
                            ROUND(v_original_amount * v_commission_pct / 100, 2));
    v_payment_fee      := COALESCE(NULLIF(v_tx.payment_fee, 0),
                            ROUND(v_original_amount * v_pix_fee_pct / 100 + v_pix_fee_fixed, 2));
    v_professional_net := COALESCE(NULLIF(v_tx.professional_net, 0),
                            v_original_amount - v_commission_fee - v_payment_fee);

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
      v_tx.professional_id,
      v_tx.id,
      v_tx.total_amount,
      v_commission_fee,
      v_payment_fee,
      0,
      v_professional_net,
      'pix',
      false,
      'Serviço recebido via PIX',
      'pending',
      NOW() + (v_pix_hours * INTERVAL '1 hour')
    );

    RAISE NOTICE 'wallet_transaction criada para transaction_id=%, profissional=%, líquido=%',
      v_tx.id, v_tx.professional_id, v_professional_net;
  END LOOP;
END $$;
