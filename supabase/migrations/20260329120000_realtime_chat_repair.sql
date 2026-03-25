-- Reparação idempotente: garantir que o Realtime (Postgres Changes) continue a receber
-- INSERT/UPDATE de mensagens e pedidos. Útil se alguma migração ou reset afetou a publicação.

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.service_requests REPLICA IDENTITY FULL;
ALTER TABLE public.chat_read_status REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_read_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_status;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
