-- Cada mensagem nova sobe a conversa na lista (ordenação por service_requests.updated_at)
-- e melhora o realtime da tela Conversas.

CREATE OR REPLACE FUNCTION public.resurrect_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_read_status
  SET is_deleted = false, is_archived = false
  WHERE request_id = NEW.request_id;

  UPDATE public.service_requests
  SET updated_at = now()
  WHERE id = NEW.request_id;

  RETURN NEW;
END;
$$;

-- Realtime: leitura/arquivamento refletem na lista (badge, prévia)
ALTER TABLE public.chat_read_status REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_read_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_status;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
