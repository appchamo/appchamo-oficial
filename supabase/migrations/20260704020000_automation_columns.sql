-- Colunas de controle (dedupe) das novas automações.

-- Match busca->oferta: marca a busca 0-resultado já notificada.
alter table public.search_events add column if not exists notified_at timestamptz;

-- Empurrão de upgrade: evita repetir o convite ao mesmo pro em pouco tempo.
alter table public.profiles add column if not exists upgrade_nudge_sent_at timestamptz;

-- Lembrete de assinatura não concluída: evita repetir.
alter table public.subscription_payments add column if not exists reminder_sent_at timestamptz;
