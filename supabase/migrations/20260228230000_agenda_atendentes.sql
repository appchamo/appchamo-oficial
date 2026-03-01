-- ============================================================
-- Atendentes/Especialistas da agenda (barbearia, clínica, etc.)
-- Serviços, regras e bloqueios passam a ser por atendente.
-- ============================================================

-- 1) Tabela de atendentes
CREATE TABLE IF NOT EXISTS public.agenda_atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  photo_url text,
  description text,
  active boolean DEFAULT true NOT NULL,
  sort_order smallint DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenda_atendentes_professional
  ON public.agenda_atendentes(professional_id);

ALTER TABLE public.agenda_atendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profissional gerencia seus atendentes" ON public.agenda_atendentes;
CREATE POLICY "Profissional gerencia seus atendentes"
  ON public.agenda_atendentes FOR ALL
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Clientes podem ver atendentes ativos" ON public.agenda_atendentes;
CREATE POLICY "Clientes podem ver atendentes ativos"
  ON public.agenda_atendentes FOR SELECT
  USING (active = true);

GRANT ALL ON public.agenda_atendentes TO authenticated;

-- 2) agenda_services: vincular a atendente (null = atendimento geral)
ALTER TABLE public.agenda_services
  ADD COLUMN IF NOT EXISTS atendente_id uuid REFERENCES public.agenda_atendentes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agenda_services_atendente
  ON public.agenda_services(atendente_id);

-- 3) agenda_availability_rules: vincular a atendente
ALTER TABLE public.agenda_availability_rules
  ADD COLUMN IF NOT EXISTS atendente_id uuid REFERENCES public.agenda_atendentes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agenda_availability_rules_atendente
  ON public.agenda_availability_rules(atendente_id);

-- 4) agenda_availability_blocks: vincular a atendente
ALTER TABLE public.agenda_availability_blocks
  ADD COLUMN IF NOT EXISTS atendente_id uuid REFERENCES public.agenda_atendentes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agenda_availability_blocks_atendente
  ON public.agenda_availability_blocks(atendente_id);

-- 5) agenda_appointments: vincular a atendente (qual atendente atendeu/atenderá)
ALTER TABLE public.agenda_appointments
  ADD COLUMN IF NOT EXISTS atendente_id uuid REFERENCES public.agenda_atendentes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_atendente
  ON public.agenda_appointments(atendente_id);

COMMENT ON TABLE public.agenda_atendentes IS 'Atendentes/especialistas da empresa (ex.: barbeiros, médicos). Serviços e horários são configurados por atendente.';
