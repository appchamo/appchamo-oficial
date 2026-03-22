-- Permite que o admin leia todas as wallet_transactions
CREATE POLICY "wallet_admin_read" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Permite que o admin atualize (para marcar como transferred)
CREATE POLICY "wallet_admin_update" ON public.wallet_transactions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Reinsere o backfill caso a migration anterior não tenha inserido (por RLS)
-- Usa service_role então não precisa de policy
INSERT INTO public.wallet_transactions (
  professional_id, transaction_id, amount, description, status, created_at
)
SELECT
  t.professional_id,
  t.id,
  t.total_amount,
  'Serviço recebido via PIX',
  'pending',
  t.created_at
FROM public.transactions t
WHERE t.status = 'completed'
  AND t.professional_id IS NOT NULL
  AND t.total_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions w WHERE w.transaction_id = t.id
  );
