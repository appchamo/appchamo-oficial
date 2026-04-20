-- Notifications: soft-delete + read_at para auditoria.
--
-- Antes desta migration, quando o usuário excluía uma notificação no app, a
-- linha era removida fisicamente da tabela. Isso impedia o painel admin de
-- mostrar "esta notificação foi excluída pelo usuário".
--
-- Agora a exclusão pelo usuário vira UPDATE deleted_at = now() (soft-delete).
-- Listagem do app continua mostrando só `deleted_at IS NULL`. O painel admin
-- consegue listar tudo (RLS "Admins can manage notifications" já cobre).
--
-- read_at é populado automaticamente por trigger quando read muda false→true,
-- garantindo timestamp confiável mesmo se o cliente esquecer de setar.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.notifications.deleted_at IS
  'Soft-delete: quando o usuário (ou admin) descartou a notificação. NULL = visível.';
COMMENT ON COLUMN public.notifications.read_at IS
  'Quando read passou de false→true. Preenchido por trigger se cliente não setar.';

-- Backfill: notificações já marcadas como lidas ganham read_at = created_at
-- (não temos timestamp real do passado; é a melhor aproximação).
UPDATE public.notifications
SET    read_at = created_at
WHERE  read = true AND read_at IS NULL;

-- Trigger: garante read_at quando read vira true
CREATE OR REPLACE FUNCTION public.notifications_set_read_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.read IS TRUE AND OLD.read IS DISTINCT FROM NEW.read AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_set_read_at ON public.notifications;
CREATE TRIGGER trg_notifications_set_read_at
BEFORE UPDATE OF read ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notifications_set_read_at();

-- Índice para listagem do painel admin (busca por user + ordenação por data).
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- REPLICA IDENTITY FULL: garante que o payload de UPDATE/DELETE em Realtime
-- traga TODAS as colunas (incluindo user_id), permitindo filtrar no client.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
