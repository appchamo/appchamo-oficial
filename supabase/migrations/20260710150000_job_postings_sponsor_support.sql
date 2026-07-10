-- Permite que patrocinadores publiquem vagas (antes só profissional).
alter table public.job_postings
  add column if not exists sponsor_id uuid references public.sponsors(id) on delete cascade;

alter table public.job_postings
  alter column professional_id drop not null;

create index if not exists idx_job_postings_sponsor on public.job_postings(sponsor_id);

-- Exatamente um dono: profissional OU patrocinador.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.job_postings'::regclass and conname = 'job_postings_one_owner'
  ) then
    alter table public.job_postings
      add constraint job_postings_one_owner
      check (num_nonnulls(professional_id, sponsor_id) = 1);
  end if;
end $$;

-- RLS: patrocinador gerencia as próprias vagas (via sponsors.user_id = auth.uid()).
drop policy if exists "Sponsor can insert jobs" on public.job_postings;
create policy "Sponsor can insert jobs" on public.job_postings
  for insert with check (
    exists (select 1 from public.sponsors s
            where s.id = job_postings.sponsor_id and s.user_id = auth.uid())
  );

drop policy if exists "Sponsor can update own jobs" on public.job_postings;
create policy "Sponsor can update own jobs" on public.job_postings
  for update using (
    exists (select 1 from public.sponsors s
            where s.id = job_postings.sponsor_id and s.user_id = auth.uid())
  );

drop policy if exists "Sponsor can delete own jobs" on public.job_postings;
create policy "Sponsor can delete own jobs" on public.job_postings
  for delete using (
    exists (select 1 from public.sponsors s
            where s.id = job_postings.sponsor_id and s.user_id = auth.uid())
  );

drop policy if exists "Sponsor can view own jobs" on public.job_postings;
create policy "Sponsor can view own jobs" on public.job_postings
  for select using (
    exists (select 1 from public.sponsors s
            where s.id = job_postings.sponsor_id and s.user_id = auth.uid())
  );
