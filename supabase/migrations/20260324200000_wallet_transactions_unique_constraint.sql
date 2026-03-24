-- Garante que não podem existir duas wallet_transactions para o mesmo pagamento.
-- Resolve a race condition entre PAYMENT_RECEIVED e PAYMENT_CONFIRMED do Asaas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_wallet_transactions_transaction_id'
  ) THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT uq_wallet_transactions_transaction_id UNIQUE (transaction_id);
  END IF;
END $$;
