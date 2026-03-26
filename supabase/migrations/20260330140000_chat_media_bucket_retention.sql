-- Fotos no chat: bucket dedicado, metadados para expurgo 30 dias após encerramento do pedido.

-- 1) Coluna: quando apagar mídias (encerramento + 30 dias)
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS chat_media_delete_after timestamptz;

COMMENT ON COLUMN public.service_requests.chat_media_delete_after IS
  'Após esta data, mídias do chat deste pedido podem ser removidas (30 dias após encerramento).';

-- 2) Define data de expurgo ao entrar em estado terminal
CREATE OR REPLACE FUNCTION public.trg_service_requests_chat_media_delete_after()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('completed', 'closed', 'cancelled', 'rejected')
     AND NEW.chat_media_delete_after IS NULL
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
     )
  THEN
    NEW.chat_media_delete_after := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_requests_chat_media_delete_after ON public.service_requests;
CREATE TRIGGER service_requests_chat_media_delete_after
  BEFORE INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_service_requests_chat_media_delete_after();

-- 3) Objetos enviados (para o job de limpeza saber o path no storage)
CREATE TABLE IF NOT EXISTS public.chat_media_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  object_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, object_path)
);

CREATE INDEX IF NOT EXISTS chat_media_attachments_request_idx
  ON public.chat_media_attachments (request_id);

ALTER TABLE public.chat_media_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_media_attachments_select_participant" ON public.chat_media_attachments;
CREATE POLICY "chat_media_attachments_select_participant"
  ON public.chat_media_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id = chat_media_attachments.request_id
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "chat_media_attachments_insert_sender" ON public.chat_media_attachments;
CREATE POLICY "chat_media_attachments_insert_sender"
  ON public.chat_media_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_media_attachments.message_id
        AND m.sender_id = auth.uid()
        AND m.request_id = chat_media_attachments.request_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id = chat_media_attachments.request_id
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

-- 4) Bucket público (leitura) — uploads só participantes do pedido (1º segmento = request_id)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  5242880,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "chat_media_insert_participant" ON storage.objects;
CREATE POLICY "chat_media_insert_participant"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id::text = (storage.foldername(name))[1]
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "chat_media_select_public" ON storage.objects;
CREATE POLICY "chat_media_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_update_participant" ON storage.objects;
CREATE POLICY "chat_media_update_participant"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id::text = (storage.foldername(name))[1]
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "chat_media_delete_participant" ON storage.objects;
CREATE POLICY "chat_media_delete_participant"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1
      FROM public.service_requests sr
      WHERE sr.id::text = (storage.foldername(name))[1]
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.professionals p
            WHERE p.id = sr.professional_id AND p.user_id = auth.uid()
          )
        )
    )
  );

-- 5) RPC usada pela Edge Function (service_role)
CREATE OR REPLACE FUNCTION public.get_chat_media_attachments_to_purge()
RETURNS TABLE (attachment_id uuid, message_id uuid, object_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.message_id, a.object_path
  FROM public.chat_media_attachments a
  INNER JOIN public.service_requests sr ON sr.id = a.request_id
  WHERE sr.chat_media_delete_after IS NOT NULL
    AND sr.chat_media_delete_after <= now();
$$;

REVOKE ALL ON FUNCTION public.get_chat_media_attachments_to_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_media_attachments_to_purge() TO service_role;

-- Pedidos já encerrados: define expurgo a partir de updated_at (retrocompatível)
UPDATE public.service_requests sr
SET chat_media_delete_after = sr.updated_at + INTERVAL '30 days'
WHERE sr.status IN ('completed', 'closed', 'cancelled', 'rejected')
  AND sr.chat_media_delete_after IS NULL;

NOTIFY pgrst, 'reload schema';
