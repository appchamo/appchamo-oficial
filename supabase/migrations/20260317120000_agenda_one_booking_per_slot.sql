-- Impede dois agendamentos no mesmo horário para o mesmo atendente (ou agenda da empresa).
-- Com atendentes: cada atendente tem seu próprio horário; 09h com atendente A não bloqueia 09h com atendente B.
-- Sem atendente (atendimento geral): apenas um agendamento por (professional, data, horário).

-- Resolve duplicatas existentes: mantém o primeiro (por created_at) e cancela os demais do mesmo slot.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY professional_id, appointment_date, start_time, COALESCE(atendente_id::text, '')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.agenda_appointments
  WHERE status IN ('pending', 'confirmed', 'done')
)
UPDATE public.agenda_appointments
SET status = 'canceled', updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Agenda da empresa (atendente_id NULL): 1 agendamento por (professional_id, data, start_time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_appointments_one_per_slot_company
  ON public.agenda_appointments (professional_id, appointment_date, start_time)
  WHERE status IN ('pending', 'confirmed', 'done') AND atendente_id IS NULL;

-- Por atendente: 1 agendamento por (professional_id, atendente_id, data, start_time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_appointments_one_per_slot_atendente
  ON public.agenda_appointments (professional_id, atendente_id, appointment_date, start_time)
  WHERE status IN ('pending', 'confirmed', 'done') AND atendente_id IS NOT NULL;

COMMENT ON INDEX idx_agenda_appointments_one_per_slot_company IS 'Garante que não haja dois agendamentos no mesmo horário na agenda da empresa (sem atendente).';
COMMENT ON INDEX idx_agenda_appointments_one_per_slot_atendente IS 'Garante que não haja dois agendamentos no mesmo horário para o mesmo atendente.';
