-- Atividade efémera na thread (digitando / gravando) via Postgres + Realtime.
-- Mais fiável que Broadcast quando o projeto tem restrições de Realtime.

CREATE TABLE IF NOT EXISTS public.chat_thread_activity (
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('typing', 'recording', 'idle')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_thread_activity_request_updated_idx
  ON public.chat_thread_activity (request_id, updated_at DESC);

ALTER TABLE public.chat_thread_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_thread_activity_select_participant" ON public.chat_thread_activity;
CREATE POLICY "chat_thread_activity_select_participant"
  ON public.chat_thread_activity
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id = chat_thread_activity.request_id
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "chat_thread_activity_insert_self_participant" ON public.chat_thread_activity;
CREATE POLICY "chat_thread_activity_insert_self_participant"
  ON public.chat_thread_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id = chat_thread_activity.request_id
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "chat_thread_activity_update_self_participant" ON public.chat_thread_activity;
CREATE POLICY "chat_thread_activity_update_self_participant"
  ON public.chat_thread_activity
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.chat_thread_activity REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_thread_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_thread_activity;
  END IF;
END
$$;

COMMENT ON TABLE public.chat_thread_activity IS 'Estado efémero: digitando/gravando na conversa; atualizado pelo app e ouvido via Realtime.';
