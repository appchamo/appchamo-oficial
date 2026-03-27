-- Notas fiscais de comissão/taxa da plataforma emitidas para o profissional (pós-repasse).
CREATE TABLE IF NOT EXISTS public.platform_fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  asaas_invoice_id text NOT NULL,
  asaas_customer_id text,
  invoice_value numeric(12, 2) NOT NULL,
  platform_fee_total numeric(12, 2) NOT NULL,
  pdf_url text,
  xml_url text,
  nf_number text,
  status text NOT NULL DEFAULT 'authorized',
  service_description text,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.platform_fee_invoice_items (
  invoice_id uuid NOT NULL REFERENCES public.platform_fee_invoices(id) ON DELETE CASCADE,
  wallet_transaction_id uuid NOT NULL REFERENCES public.wallet_transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, wallet_transaction_id),
  CONSTRAINT uq_platform_fee_invoice_wallet_tx UNIQUE (wallet_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_invoices_professional ON public.platform_fee_invoices(professional_id);
CREATE INDEX IF NOT EXISTS idx_platform_fee_invoices_created ON public.platform_fee_invoices(created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_fee_invoices;

ALTER TABLE public.platform_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_fee_invoices_pro_select"
  ON public.platform_fee_invoices FOR SELECT TO authenticated
  USING (
    professional_id IN (
      SELECT id FROM public.professionals p WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "platform_fee_invoice_items_pro_select"
  ON public.platform_fee_invoice_items FOR SELECT TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id FROM public.platform_fee_invoices i
      INNER JOIN public.professionals p ON p.id = i.professional_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "platform_fee_invoices_admin_select"
  ON public.platform_fee_invoices FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "platform_fee_invoice_items_admin_select"
  ON public.platform_fee_invoice_items FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.platform_fee_invoices IS 'NFS-e da plataforma Chamô sobre comissão/taxa, vinculada a repasses (wallet_transactions).';
COMMENT ON COLUMN public.platform_fee_invoices.invoice_value IS 'Valor total da nota (geralmente soma platform_fee dos itens).';

GRANT SELECT ON TABLE public.platform_fee_invoices TO authenticated;
GRANT SELECT ON TABLE public.platform_fee_invoice_items TO authenticated;
GRANT ALL ON TABLE public.platform_fee_invoices TO service_role;
GRANT ALL ON TABLE public.platform_fee_invoice_items TO service_role;
