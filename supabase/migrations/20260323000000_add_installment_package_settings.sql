-- Atualiza a política RLS de platform_settings para incluir
-- os novos keys de configuração de parcelas e antecipação
DROP POLICY IF EXISTS "Authenticated users can view fee settings" ON "public"."platform_settings";

CREATE POLICY "Authenticated users can view fee settings"
ON "public"."platform_settings"
FOR SELECT
USING (
  "key" = ANY (ARRAY[
    'pix_fee_pct'::text,
    'pix_fee_fixed'::text,
    'card_fee_pct'::text,
    'card_fee_fixed'::text,
    'card_installment_fee_pct'::text,
    'card_installment_fee_fixed'::text,
    'card_installment_increment'::text,
    'max_installments'::text,
    'installment_fee_2x'::text,
    'installment_fee_3x'::text,
    'installment_fee_4x'::text,
    'installment_fee_5x'::text,
    'installment_fee_6x'::text,
    'installment_fee_7x'::text,
    'installment_fee_8x'::text,
    'installment_fee_9x'::text,
    'installment_fee_10x'::text,
    'installment_fee_11x'::text,
    'installment_fee_12x'::text,
    'installment_mode'::text,
    'installment_packages'::text,
    'commission_pct'::text,
    'commission_percent'::text,
    'discount_coupon_percent'::text,
    'discount_coupon_validity_days'::text,
    'discount_coupon_type'::text,
    'transfer_period_pix_hours'::text,
    'transfer_period_card_days'::text,
    'transfer_period_card_anticipated_days'::text,
    'anticipation_fee_pct'::text,
    'anticipation_mode'::text,
    'anticipation_monthly_rate'::text
  ])
);
