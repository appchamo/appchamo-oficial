-- ============================================================
-- Agenda exclusiva plano Business - Estrutura de banco
-- ============================================================

-- 1) Flag no profissional para ativar/desativar agenda (opcional)
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS agenda_enabled boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.professionals.agenda_enabled IS 'Agenda ativa apenas para plano Business; ativar/desativar no menu.';

-- 2) Serviços da agenda (duração personalizada por profissional)
CREATE TABLE IF NOT EXISTS public.agenda_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.agenda_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profissional gerencia seus serviços" ON public.agenda_services;
CREATE POLICY "Profissional gerencia seus serviços"
  ON public.agenda_services FOR ALL
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Clientes podem ver serviços ativos de profissionais" ON public.agenda_services;
CREATE POLICY "Clientes podem ver serviços ativos de profissionais"
  ON public.agenda_services FOR SELECT
  USING (active = true);

-- 3) Regras de disponibilidade semanal (dias e horários fixos)
CREATE TABLE IF NOT EXISTS public.agenda_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  slot_interval_minutes integer NOT NULL DEFAULT 30 CHECK (slot_interval_minutes > 0 AND slot_interval_minutes <= 120),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity >= 1 AND capacity <= 50),
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.agenda_availability_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profissional gerencia suas regras" ON public.agenda_availability_rules;
CREATE POLICY "Profissional gerencia suas regras"
  ON public.agenda_availability_rules FOR ALL
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Clientes podem ver regras de disponibilidade" ON public.agenda_availability_rules;
CREATE POLICY "Clientes podem ver regras de disponibilidade"
  ON public.agenda_availability_rules FOR SELECT
  USING (true);

-- 4) Bloqueios manuais por data/horário
CREATE TABLE IF NOT EXISTS public.agenda_availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  reason text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.agenda_availability_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profissional gerencia seus bloqueios" ON public.agenda_availability_blocks;
CREATE POLICY "Profissional gerencia seus bloqueios"
  ON public.agenda_availability_blocks FOR ALL
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Clientes podem ver bloqueios" ON public.agenda_availability_blocks;
CREATE POLICY "Clientes podem ver bloqueios"
  ON public.agenda_availability_blocks FOR SELECT
  USING (true);

-- 5) Agendamentos (vinculados a service_request para chat)
CREATE TABLE IF NOT EXISTS public.agenda_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.agenda_services(id) ON DELETE RESTRICT,
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'canceled', 'rejected', 'done')),
  chat_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_professional_date
  ON public.agenda_appointments (professional_id, appointment_date, start_time);

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_client
  ON public.agenda_appointments (client_id, status);

ALTER TABLE public.agenda_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profissional vê e atualiza seus agendamentos" ON public.agenda_appointments;
CREATE POLICY "Profissional vê e atualiza seus agendamentos"
  ON public.agenda_appointments FOR ALL
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Cliente vê e cria seus agendamentos" ON public.agenda_appointments;
CREATE POLICY "Cliente vê e cria seus agendamentos"
  ON public.agenda_appointments FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.agenda_appointments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_appointments_updated_at ON public.agenda_appointments;
CREATE TRIGGER agenda_appointments_updated_at
  BEFORE UPDATE ON public.agenda_appointments
  FOR EACH ROW EXECUTE FUNCTION public.agenda_appointments_updated_at();

-- Grants
GRANT ALL ON public.agenda_services TO authenticated;
GRANT ALL ON public.agenda_availability_rules TO authenticated;
GRANT ALL ON public.agenda_availability_blocks TO authenticated;
GRANT ALL ON public.agenda_appointments TO authenticated;
