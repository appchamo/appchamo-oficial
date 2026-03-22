-- Rastreamento de plano pago nos patrocinadores
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS plan_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

-- Tabela de pagamentos dos patrocinadores
CREATE TABLE IF NOT EXISTS public.sponsor_payments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id           UUID        NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  pack                 TEXT        NOT NULL CHECK (pack IN ('pack_14', 'pack_28')),
  payment_method       TEXT        NOT NULL CHECK (payment_method IN ('PIX', 'CREDIT_CARD')),
  amount               NUMERIC(10,2) NOT NULL,
  asaas_payment_id     TEXT,
  asaas_subscription_id TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending',
  pix_qr_code          TEXT,
  pix_copy_paste       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: cada patrocinador só ve/altera os próprios pagamentos
ALTER TABLE public.sponsor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsor_payments_own"
  ON public.sponsor_payments
  FOR ALL
  USING (
    sponsor_id IN (
      SELECT id FROM public.sponsors WHERE user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
