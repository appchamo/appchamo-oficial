-- Adiciona coluna anticipation_enabled à tabela transactions
-- para rastrear se a antecipação foi selecionada nesta cobrança específica
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS anticipation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
