
-- Table to store enterprise upgrade requests pending admin approval
CREATE TABLE public.enterprise_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cnpj text NOT NULL,
  company_name text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_zip text,
  cadastral_status text,
  asaas_customer_id text,
  asaas_credit_card_token text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enterprise_upgrade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON public.enterprise_upgrade_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own requests" ON public.enterprise_upgrade_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage requests" ON public.enterprise_upgrade_requests
  FOR ALL USING (is_admin(auth.uid()));

CREATE TRIGGER update_enterprise_upgrade_requests_updated_at
  BEFORE UPDATE ON public.enterprise_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
