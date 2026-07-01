-- Verificação de identidade (KYC) do cliente antes de chamar profissionais.

-- 1) Colunas no perfil
alter table public.profiles
  add column if not exists identity_verified boolean not null default false,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_doc_type text;

-- 2) Tabela de auditoria/revisão (paths no bucket privado kyc)
create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null,
  doc_front_path text,
  doc_back_path text,
  selfie_path text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_identity_verifications_user on public.identity_verifications(user_id);

alter table public.identity_verifications enable row level security;

drop policy if exists identity_verifications_own_insert on public.identity_verifications;
create policy identity_verifications_own_insert on public.identity_verifications
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists identity_verifications_own_select on public.identity_verifications;
create policy identity_verifications_own_select on public.identity_verifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 3) Bucket PRIVADO para documentos de KYC
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

drop policy if exists kyc_own_insert on storage.objects;
create policy kyc_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists kyc_own_select on storage.objects;
create policy kyc_own_select on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())));

drop policy if exists kyc_own_update on storage.objects;
create policy kyc_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) RPC: registra a verificação e marca o perfil como verificado
create or replace function public.submit_identity_verification(
  p_doc_type text,
  p_front text,
  p_back text,
  p_selfie text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.identity_verifications(user_id, doc_type, doc_front_path, doc_back_path, selfie_path, terms_accepted_at)
    values (auth.uid(), p_doc_type, p_front, p_back, p_selfie, now());
  update public.profiles
    set identity_verified = true,
        identity_verified_at = now(),
        identity_doc_type = p_doc_type
    where user_id = auth.uid();
end;
$$;

grant execute on function public.submit_identity_verification(text, text, text, text) to authenticated;
