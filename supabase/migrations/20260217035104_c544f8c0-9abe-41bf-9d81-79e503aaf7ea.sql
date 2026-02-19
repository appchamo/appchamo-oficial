-- Allow authenticated users to read fee-related platform settings
CREATE POLICY "Authenticated users can view fee settings"
ON public.platform_settings
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND key IN (
    'pix_fee_pct', 'pix_fee_fixed',
    'card_fee_pct', 'card_fee_fixed',
    'card_installment_fee_pct', 'card_installment_fee_fixed',
    'card_installment_increment',
    'max_installments',
    'installment_fee_2x', 'installment_fee_3x', 'installment_fee_4x',
    'installment_fee_5x', 'installment_fee_6x', 'installment_fee_7x',
    'installment_fee_8x', 'installment_fee_9x', 'installment_fee_10x',
    'installment_fee_11x', 'installment_fee_12x',
    'commission_pct', 'commission_percent',
    'discount_coupon_percent', 'discount_coupon_validity_days',
    'discount_coupon_type'
  )
);