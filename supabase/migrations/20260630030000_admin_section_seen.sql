-- "Visto em" por admin/seção, para badges de novidades no menu admin.
create table if not exists public.admin_section_seen (
  admin_user_id uuid not null,
  section text not null,
  seen_at timestamptz not null default now(),
  primary key (admin_user_id, section)
);
alter table public.admin_section_seen enable row level security;
drop policy if exists "admin manages own seen" on public.admin_section_seen;
create policy "admin manages own seen" on public.admin_section_seen
  for all to authenticated
  using (admin_user_id = auth.uid() and public.is_admin(auth.uid()))
  with check (admin_user_id = auth.uid() and public.is_admin(auth.uid()));
