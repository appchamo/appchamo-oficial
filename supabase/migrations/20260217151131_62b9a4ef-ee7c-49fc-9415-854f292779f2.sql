
-- Professional fiscal/banking data
CREATE TABLE public.professional_fiscal_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  -- Banking
  payment_method text NOT NULL DEFAULT 'pix', -- 'pix' or 'bank_transfer'
  bank_name text,
  bank_agency text,
  bank_account text,
  bank_account_type text DEFAULT 'corrente', -- 'corrente' or 'poupanca'
  pix_key text,
  pix_key_type text, -- 'cpf', 'cnpj', 'email', 'phone', 'random'
  -- Fiscal
  fiscal_name text,
  fiscal_document text, -- CPF or CNPJ (must match profile)
  fiscal_email text,
  fiscal_address_street text,
  fiscal_address_number text,
  fiscal_address_complement text,
  fiscal_address_neighborhood text,
  fiscal_address_city text,
  fiscal_address_state text,
  fiscal_address_zip text,
  -- Fee preferences
  charge_interest_to_client boolean NOT NULL DEFAULT false, -- if true, client pays installment fees
  anticipation_enabled boolean NOT NULL DEFAULT false, -- if true, receive in 4 days instead of 33
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_professional_fiscal UNIQUE (professional_id)
);

ALTER TABLE public.professional_fiscal_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can view own fiscal data"
ON public.professional_fiscal_data FOR SELECT
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_fiscal_data.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can insert own fiscal data"
ON public.professional_fiscal_data FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_fiscal_data.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can update own fiscal data"
ON public.professional_fiscal_data FOR UPDATE
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_fiscal_data.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Admins can manage fiscal data"
ON public.professional_fiscal_data FOR ALL
USING (is_admin(auth.uid()));

CREATE TRIGGER update_fiscal_data_updated_at
BEFORE UPDATE ON public.professional_fiscal_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add default transfer period and anticipation settings
INSERT INTO public.platform_settings (key, value) VALUES 
  ('transfer_period_pix_hours', '"48"'),
  ('transfer_period_card_days', '"33"'),
  ('transfer_period_card_anticipated_days', '"4"'),
  ('anticipation_fee_pct', '"3.5"')
ON CONFLICT (key) DO NOTHING;
