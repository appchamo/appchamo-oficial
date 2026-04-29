-- Central de notificações do admin (Admin > Notificações > "Notificações enviadas").
--
-- Antes desta migration, cada envio do painel inseria N linhas em
-- public.notifications sem nenhuma "ata" do envio. Para mostrar a aba
-- "Notificações enviadas" precisaríamos heuristicamente agrupar por
-- (title, message, created_at±x), o que é frágil.
--
-- Solução: criar uma tabela "admin_notification_batches" que registra cada
-- envio (quem enviou, para que público, quantos receberam, qual link, etc.)
-- e amarrar cada notificação criada ao seu batch via notifications.batch_id.
-- Assim a aba lista batches e abre o detalhe (status por destinatário) com
-- 1 query por linha selecionada.

CREATE TABLE IF NOT EXISTS public.admin_notification_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_email   text,
  sent_by_name    text,
  title           text NOT NULL,
  message         text NOT NULL,
  link            text,
  -- Ex.: 'all' | 'clients' | 'professionals' | 'companies' | 'pending_pros'
  --      | 'category' | 'individual' | 'selected'
  target_type     text NOT NULL,
  -- Metadados específicos do alvo: { category_id, category_name, user_ids, user_summaries }
  target_meta     jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_notification_batches IS
  'Log de envios de notificações feitos pelo admin via painel. Usado pela aba "Notificações enviadas".';

CREATE INDEX IF NOT EXISTS idx_admin_notif_batches_created
  ON public.admin_notification_batches (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notif_batches_sent_by
  ON public.admin_notification_batches (sent_by, created_at DESC);

-- Liga cada notificação ao seu batch (NULLABLE: notificações geradas por
-- triggers/sistema continuam sem batch_id; e batches antigos permanecem sem
-- referência cruzada — não tem como recriar histórico).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS batch_id uuid
    REFERENCES public.admin_notification_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_batch_id
  ON public.notifications (batch_id) WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN public.notifications.batch_id IS
  'Referência ao envio em admin_notification_batches quando a notificação foi criada pelo painel admin.';

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_notification_batches ENABLE ROW LEVEL SECURITY;

-- Apenas admins leem/inserem (front grava direto via supabase.from(...)).
DROP POLICY IF EXISTS "admins_select_admin_notif_batches" ON public.admin_notification_batches;
CREATE POLICY "admins_select_admin_notif_batches"
  ON public.admin_notification_batches
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_insert_admin_notif_batches" ON public.admin_notification_batches;
CREATE POLICY "admins_insert_admin_notif_batches"
  ON public.admin_notification_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND sent_by = auth.uid());

DROP POLICY IF EXISTS "admins_update_admin_notif_batches" ON public.admin_notification_batches;
CREATE POLICY "admins_update_admin_notif_batches"
  ON public.admin_notification_batches
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_delete_admin_notif_batches" ON public.admin_notification_batches;
CREATE POLICY "admins_delete_admin_notif_batches"
  ON public.admin_notification_batches
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Realtime: payload completo em UPDATE/DELETE (a aba escuta INSERTs novos).
ALTER TABLE public.admin_notification_batches REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
