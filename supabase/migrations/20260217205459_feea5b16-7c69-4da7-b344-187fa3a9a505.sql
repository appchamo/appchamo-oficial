DROP POLICY IF EXISTS "Authenticated users can view fee settings" ON public.platform_settings;

CREATE POLICY "Authenticated users can view fee settings"
ON public.platform_settings
FOR SELECT
USING (
  key = ANY (ARRAY[
    'pix_fee_pct', 'pix_fee_fixed',
    'card_fee_pct', 'card_fee_fixed',
    'card_installment_fee_pct', 'card_installment_fee_fixed', 'card_installment_increment',
    'max_installments',
    'installment_fee_2x', 'installment_fee_3x', 'installment_fee_4x', 'installment_fee_5x', 'installment_fee_6x',
    'installment_fee_7x', 'installment_fee_8x', 'installment_fee_9x', 'installment_fee_10x', 'installment_fee_11x', 'installment_fee_12x',
    'commission_pct', 'commission_percent',
    'discount_coupon_percent', 'discount_coupon_validity_days', 'discount_coupon_type',
    'transfer_period_pix_hours', 'transfer_period_card_days', 'transfer_period_card_anticipated_days',
    'anticipation_fee_pct'
  ])
);