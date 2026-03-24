-- Garante que não podem existir duas wallet_transactions para o mesmo pagamento.
-- Resolve a race condition entre PAYMENT_RECEIVED e PAYMENT_CONFIRMED do Asaas.
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT uq_wallet_transactions_transaction_id UNIQUE (transaction_id);
