-- Adiciona tipo de documento cadastrado pelo profissional (cpf | cnpj)
-- CPF → plano VIP antecipado  |  CNPJ → plano Business antecipado
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS doc_type TEXT CHECK (doc_type IN ('cpf', 'cnpj'));

NOTIFY pgrst, 'reload schema';
