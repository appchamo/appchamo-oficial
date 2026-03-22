-- Insere na carteira todas as transações completadas que ainda não estão lá
INSERT INTO public.wallet_transactions (
  professional_id,
  transaction_id,
  amount,
  description,
  status,
  created_at
)
SELECT
  t.professional_id,
  t.id,
  t.total_amount,
  COALESCE('Serviço recebido via PIX', 'Pagamento recebido'),
  'pending',
  t.created_at
FROM public.transactions t
WHERE t.status = 'completed'
  AND t.professional_id IS NOT NULL
  AND t.total_amount > 0
  -- Só insere se ainda não existe registro para essa transaction_id
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions w
    WHERE w.transaction_id = t.id
  );
