-- Preferências de notificação por canal (opt-in/out). Default: ligado.
alter table public.profiles
  add column if not exists whatsapp_notifications_enabled boolean not null default true,
  add column if not exists updates_notifications_enabled  boolean not null default true,
  add column if not exists chat_notifications_enabled     boolean not null default true;

comment on column public.profiles.whatsapp_notifications_enabled is 'Opt-in para receber mensagens no WhatsApp (compliance Meta).';
comment on column public.profiles.updates_notifications_enabled is 'Receber notificações de novidades/atualizações do app.';
comment on column public.profiles.chat_notifications_enabled is 'Receber notificações de novas mensagens no chat.';
