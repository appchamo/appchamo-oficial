-- Adiciona flag de acesso antecipado Business (promoção de lançamento até 14/04/2026)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS early_access BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
