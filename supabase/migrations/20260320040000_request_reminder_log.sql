-- Tabela de log para evitar lembretes duplicados de solicitações sem resposta.
CREATE TABLE IF NOT EXISTS public.request_reminder_log (
  id             uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id     uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  reminder_type  text NOT NULL,            -- '30min' | '2h'
  sent_at        timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (request_id, reminder_type)
);

ALTER TABLE public.request_reminder_log ENABLE ROW LEVEL SECURITY;

-- Apenas service role pode ler/escrever (usado só pela edge function)
CREATE POLICY "Service role only"
  ON public.request_reminder_log
  USING (false);
