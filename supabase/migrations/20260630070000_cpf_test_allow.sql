-- CPF(s) de teste reutilizáveis: exclui da unicidade.
drop index if exists public.idx_profiles_cpf_unique;
drop index if exists public.profiles_cpf_unique;
create unique index profiles_cpf_unique on public.profiles (cpf)
  where (cpf is not null and cpf <> '' and cpf not in ('00000000000'));
