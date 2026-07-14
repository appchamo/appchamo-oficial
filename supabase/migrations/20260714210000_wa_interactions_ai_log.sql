-- Log/dedup das mensagens recebidas no WhatsApp respondidas automaticamente pela IA.
create table if not exists public.wa_interactions (
  id            bigint generated always as identity primary key,
  wa_message_id text not null,
  from_phone    text,
  kind          text,                 -- 'text' | 'button' | 'interactive'
  incoming_text text,
  reply_text    text,
  status        text default 'pending', -- 'sent' | 'skipped' | 'error'
  error         text,
  created_at    timestamptz not null default now()
);
create unique index if not exists uniq_wa_interactions_msg on public.wa_interactions(wa_message_id);
create index if not exists idx_wa_interactions_created on public.wa_interactions(created_at desc);

alter table public.wa_interactions enable row level security;
drop policy if exists "admin le wa_interactions" on public.wa_interactions;
create policy "admin le wa_interactions" on public.wa_interactions
  for select using (public.is_admin(auth.uid()));
