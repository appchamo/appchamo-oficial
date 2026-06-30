-- Checagem de qualidade (IA) da selfie/documento no cadastro. Não é biometria/identificação.
alter table public.profiles
  add column if not exists selfie_check_status text,
  add column if not exists selfie_check_reason text,
  add column if not exists selfie_check_at timestamptz,
  add column if not exists selfie_url text;
