-- Reações 👍 / 👎 em mensagens de chat (um voto por usuário por mensagem)

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message_id
  ON public.chat_message_reactions (message_id);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_message_reactions_select_participants" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_select_participants"
  ON public.chat_message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages cm
      JOIN public.service_requests sr ON sr.id = cm.request_id
      WHERE cm.id = chat_message_reactions.message_id
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = sr.professional_id AND p.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "chat_message_reactions_insert_own_participant" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_insert_own_participant"
  ON public.chat_message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.chat_messages cm
      JOIN public.service_requests sr ON sr.id = cm.request_id
      WHERE cm.id = message_id
        AND (
          sr.client_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = sr.professional_id AND p.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "chat_message_reactions_update_own" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_update_own"
  ON public.chat_message_reactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_message_reactions_delete_own" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_delete_own"
  ON public.chat_message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT ALL ON TABLE public.chat_message_reactions TO authenticated;
GRANT ALL ON TABLE public.chat_message_reactions TO service_role;
