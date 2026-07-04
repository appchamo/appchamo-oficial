-- Log de termos de pesquisa (o que os usuários digitam na busca).
-- Privado: qualquer usuário logado pode inserir o próprio termo; só admin lê.
create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  term_norm text,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  results_count int,
  city text,
  created_at timestamptz not null default now()
);

create index if not exists search_events_created_idx on public.search_events (created_at desc);
create index if not exists search_events_norm_idx on public.search_events (term_norm);

alter table public.search_events enable row level security;

-- Insert: qualquer usuário autenticado registra a própria busca.
drop policy if exists "search insert own" on public.search_events;
create policy "search insert own" on public.search_events
  for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- Select: só admin.
drop policy if exists "search admin select" on public.search_events;
create policy "search admin select" on public.search_events
  for select to authenticated
  using (public.is_admin(auth.uid()));

comment on table public.search_events is 'Termos digitados na busca do app (para relatório de demanda). Privado, só admin lê.';
