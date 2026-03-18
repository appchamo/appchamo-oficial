-- Marca quando o profissional concluiu o cadastro fiscal (Salvar dados fiscais).
ALTER TABLE public.professional_fiscal_data
  ADD COLUMN IF NOT EXISTS fiscal_registration_completed_at timestamptz;

COMMENT ON COLUMN public.professional_fiscal_data.fiscal_registration_completed_at IS
  'Preenchido ao salvar cadastro fiscal completo no app; usado para ocultar alerta na Home.';

-- Quem já tinha cadastro preenchido não precisa passar pelo alerta de novo
UPDATE public.professional_fiscal_data
SET fiscal_registration_completed_at = COALESCE(updated_at, now())
WHERE fiscal_registration_completed_at IS NULL
  AND length(trim(COALESCE(fiscal_name, ''))) > 0
  AND length(trim(COALESCE(fiscal_email, ''))) > 0
  AND length(trim(COALESCE(fiscal_document, ''))) > 0
  AND length(trim(COALESCE(fiscal_address_street, ''))) > 0
  AND length(trim(COALESCE(fiscal_address_number, ''))) > 0
  AND length(trim(COALESCE(fiscal_address_zip, ''))) > 0
  AND (
    (payment_method = 'pix' AND length(trim(COALESCE(pix_key, ''))) > 0)
    OR (
      payment_method = 'bank_transfer'
      AND length(trim(COALESCE(bank_name, ''))) > 0
      AND length(trim(COALESCE(bank_agency, ''))) > 0
      AND length(trim(COALESCE(bank_account, ''))) > 0
    )
  );
