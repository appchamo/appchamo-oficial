-- Corrige todos os registros pendentes usando professional_net da transactions
UPDATE public.wallet_transactions wt
SET
  gross_amount = t.total_amount,
  platform_fee_amount = t.platform_fee,
  amount = t.professional_net
FROM public.transactions t
WHERE wt.transaction_id = t.id
  AND wt.status = 'pending'
  AND t.professional_net IS NOT NULL;
