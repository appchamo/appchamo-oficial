-- Horário de fechamento (ex.: almoço) em cada regra de dia da semana
ALTER TABLE public.agenda_availability_rules
  ADD COLUMN IF NOT EXISTS break_start_time time,
  ADD COLUMN IF NOT EXISTS break_end_time time;

COMMENT ON COLUMN public.agenda_availability_rules.break_start_time IS 'Início do horário fechado (ex.: almoço) neste dia';
COMMENT ON COLUMN public.agenda_availability_rules.break_end_time IS 'Fim do horário fechado neste dia';
