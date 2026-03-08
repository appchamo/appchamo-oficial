-- =============================================================================
-- Seed: 1 cliente + 1 profissional para testes de análise em loja de apps
-- Cole este script no SQL Editor do Supabase (Dashboard → SQL Editor) e execute.
--
-- Requer:
--   - Ao menos 1 categoria e 1 profissão ativas no admin.
--   - Se o projeto ainda não tiver nenhum usuário no Auth, crie um qualquer
--     pelo Dashboard (Authentication → Add user) antes de rodar, para existir
--     instance_id em auth.users.
--
-- Credenciais (ver docs/PLAY_CONSOLE_TEST_USERS.md):
--   Cliente:    play-console-cliente@chamo-app.com    / PlayConsole2026!
--   Profissional: play-console-profissional@chamo-app.com / PlayConsole2026!
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1 cliente + 1 profissional
WITH seed_data AS (
  SELECT
    gen_random_uuid() AS id,
    'play-console-cliente@chamo-app.com' AS email,
    'Teste Cliente Play' AS full_name,
    'client' AS user_type
  UNION ALL
  SELECT
    gen_random_uuid(),
    'play-console-profissional@chamo-app.com',
    'Teste Profissional Play',
    'professional'
)
-- Colunas de token devem ser '' (não NULL), senão o login retorna "Database error querying schema"
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
SELECT
  s.id,
  (SELECT instance_id FROM auth.users LIMIT 1),
  'authenticated',
  'authenticated',
  s.email,
  crypt('PlayConsole2026!', gen_salt('bf')),
  jsonb_build_object('full_name', s.full_name, 'user_type', s.user_type),
  '{}'::jsonb,
  now(),
  now(),
  now(),
  '',
  '',
  '',
  ''
FROM seed_data s;

-- Perfil do profissional: cidade e avatar (opcional, para aparecer na busca)
UPDATE public.profiles pr
SET
  address_city = 'Uberlândia',
  address_state = 'MG',
  address_country = 'Brasil',
  avatar_url = 'https://i.pravatar.cc/400?img=33'
WHERE pr.email = 'play-console-profissional@chamo-app.com';

-- Inserir registro em professionals (1 categoria e 1 profissão ativas)
INSERT INTO public.professionals (user_id, category_id, profession_id, bio, profile_status, active, verified, rating, total_reviews, total_services, availability_status)
SELECT
  pr.user_id,
  (SELECT id FROM public.categories WHERE active = true LIMIT 1),
  (SELECT id FROM public.professions WHERE active = true LIMIT 1),
  'Profissional de teste para análise do app no Play Console.',
  'approved',
  true,
  true,
  0,
  0,
  0,
  'available'
FROM public.profiles pr
WHERE pr.email = 'play-console-profissional@chamo-app.com';
