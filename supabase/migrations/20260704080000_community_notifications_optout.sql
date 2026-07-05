-- Sino: opt-out de notificacoes de novas publicacoes da comunidade.
alter table public.profiles add column if not exists community_notifications_enabled boolean not null default true;
-- (funcao notify_followers_new_community_post atualizada para respeitar a coluna; ver painel)
