-- Recalcula todas as wallet_transactions pendentes com as configurações atuais da plataforma
DO $$
DECLARE
  v_commission_pct  NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'commission_pct'), 10);
  v_pix_fee_pct     NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'pix_fee_pct'), 0);
  v_pix_fee_fixed   NUMERIC := COALESCE((SELECT (value #>> '{}')::NUMERIC FROM platform_settings WHERE key = 'pix_fee_fixed'), 0);
BEGIN
  -- Atualiza wallet_transactions pendentes de PIX
  UPDATE public.wallet_transactions wt
  SET
    platform_fee_amount   = ROUND(wt.gross_amount * v_commission_pct / 100, 2),
    payment_fee_amount    = ROUND(wt.gross_amount * v_pix_fee_pct / 100 + v_pix_fee_fixed, 2),
    amount                = ROUND(
                              wt.gross_amount
                              - ROUND(wt.gross_amount * v_commission_pct / 100, 2)
                              - ROUND(wt.gross_amount * v_pix_fee_pct / 100 + v_pix_fee_fixed, 2),
                              2
                            )
  WHERE wt.status = 'pending'
    AND (wt.payment_method = 'pix' OR wt.payment_method IS NULL);

  -- Também atualiza o professional_net na tabela transactions para refletir o valor correto
  UPDATE public.transactions t
  SET
    platform_fee    = ROUND(t.total_amount * v_commission_pct / 100, 2)
                      + ROUND(t.total_amount * v_pix_fee_pct / 100 + v_pix_fee_fixed, 2),
    professional_net = t.total_amount
                      - ROUND(t.total_amount * v_commission_pct / 100, 2)
                      - ROUND(t.total_amount * v_pix_fee_pct / 100 + v_pix_fee_fixed, 2)
  WHERE t.status = 'completed'
    AND EXISTS (
      SELECT 1 FROM public.wallet_transactions wt
      WHERE wt.transaction_id = t.id AND wt.status = 'pending'
    );
END $$;
