-- Adiciona preços anual e semestral à tabela de planos
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS price_annual  NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_semester NUMERIC(10, 2) DEFAULT NULL;
