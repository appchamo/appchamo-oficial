-- Tabela para evitar enviar o mesmo lembrete mais de uma vez
CREATE TABLE IF NOT EXISTS public.agenda_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.agenda_appointments(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '1h')),
  sent_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (appointment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_agenda_reminder_log_appointment
  ON public.agenda_reminder_log(appointment_id);

-- Apenas a Edge Function (service_role) precisa inserir; não expor para usuários
ALTER TABLE public.agenda_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only for reminder log" ON public.agenda_reminder_log;
CREATE POLICY "Service role only for reminder log"
  ON public.agenda_reminder_log
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Permite que service_role insira (RLS com policy false bloqueia anon/authenticated; service_role bypassa RLS)
COMMENT ON TABLE public.agenda_reminder_log IS 'Log de lembretes de agendamento enviados (24h e 1h antes); usado pela Edge Function agenda-reminders.';
