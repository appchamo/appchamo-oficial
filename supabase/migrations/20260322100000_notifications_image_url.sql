-- Adiciona coluna image_url na tabela notifications
-- Usada para exibir o avatar do remetente/ator na notificação push
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
