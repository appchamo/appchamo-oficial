-- Registro e dedup das interações do Instagram respondidas pela IA (social media automático).
create table if not exists public.ig_interactions (
  id           bigint generated always as identity primary key,
  kind         text not null,                       -- 'dm' | 'comment'
  external_id  text not null,                       -- message id (mid) ou comment id (dedup)
  ig_account_id text,
  from_id      text,
  from_username text,
  incoming_text text,
  reply_text   text,
  action       text,                                -- 'reply' | 'skip'
  status       text default 'pending',              -- 'sent' | 'skipped' | 'error'
  error        text,
  created_at   timestamptz not null default now()
);
create unique index if not exists uniq_ig_interactions_external
  on public.ig_interactions(kind, external_id);
create index if not exists idx_ig_interactions_created on public.ig_interactions(created_at desc);

alter table public.ig_interactions enable row level security;
drop policy if exists "admin le ig_interactions" on public.ig_interactions;
create policy "admin le ig_interactions" on public.ig_interactions
  for select using (public.is_admin(auth.uid()));

comment on table public.ig_interactions is
  'Log/dedup das mensagens e comentários do Instagram respondidos automaticamente pela IA.';
