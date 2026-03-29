-- Permite apagar utilizador em auth.users mesmo com denúncias de chat ou transações como cliente.
-- Sem isto, auth.admin.deleteUser falha com violação de FK (Edge admin-manage / exclusão de conta).

ALTER TABLE public.chat_reports
  DROP CONSTRAINT IF EXISTS chat_reports_reporter_id_fkey;

ALTER TABLE public.chat_reports
  ADD CONSTRAINT chat_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_client_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES auth.users (id) ON DELETE SET NULL;
