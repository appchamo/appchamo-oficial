-- Carteira dos profissionais
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transferred')),
  transferred_at TIMESTAMPTZ,
  transferred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  asaas_transfer_id TEXT,
  pix_key TEXT,
  pix_key_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Profissional vê só as próprias
CREATE POLICY "wallet_own_read" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (
    professional_id IN (
      SELECT id FROM public.professionals WHERE user_id = auth.uid()
    )
  );

-- Admin vê todas (via service_role nas edge functions)
CREATE POLICY "wallet_service_all" ON public.wallet_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;

-- Índices
CREATE INDEX IF NOT EXISTS idx_wallet_professional ON public.wallet_transactions(professional_id);
CREATE INDEX IF NOT EXISTS idx_wallet_status ON public.wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transaction ON public.wallet_transactions(transaction_id);
