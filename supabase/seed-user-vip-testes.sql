-- =============================================================================
-- Seed: usuário profissional no plano VIP (testes)
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor).
--
-- Credenciais:
--   E-mail: testes@appchamo.com
--   Senha:  testeapp
--   CNPJ:   54.308.342/0001-00
--   Plano:  VIP | Tipo: profissional
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Criar usuário no Auth (trigger cria profile + subscription free)
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
  gen_random_uuid(),
  (SELECT instance_id FROM auth.users LIMIT 1),
  'authenticated',
  'authenticated',
  'testes@appchamo.com',
  crypt('testeapp', gen_salt('bf')),
  jsonb_build_object('full_name', 'Testes AppChamo', 'user_type', 'professional'),
  '{}'::jsonb,
  now(),
  now(),
  now(),
  '',
  '',
  '',
  ''
FROM (SELECT 1) AS _dummy
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testes@appchamo.com');

-- 2) Ajustar profile: CNPJ e garantir user_type professional
UPDATE public.profiles
SET
  full_name = 'Testes AppChamo',
  user_type = 'professional',
  cnpj = '54308342000100'
WHERE email = 'testes@appchamo.com';

-- 3) Role professional (para acessar área de profissional)
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'professional'::public.app_role
FROM public.profiles p
WHERE p.email = 'testes@appchamo.com'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'professional');

-- 4) Registro em professionals (categoria e profissão ativas)
INSERT INTO public.professionals (user_id, category_id, profession_id, bio, profile_status, active, verified, rating, total_reviews, total_services, availability_status)
SELECT
  p.user_id,
  (SELECT id FROM public.categories WHERE active = true LIMIT 1),
  (SELECT id FROM public.professions WHERE active = true LIMIT 1),
  'Profissional de teste – plano VIP.',
  'approved',
  true,
  true,
  0,
  0,
  0,
  'available'
FROM public.profiles p
WHERE p.email = 'testes@appchamo.com'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.user_id);

-- 5) Plano VIP ativo
UPDATE public.subscriptions
SET plan_id = 'vip', status = 'active', updated_at = now()
WHERE user_id = (SELECT user_id FROM public.profiles WHERE email = 'testes@appchamo.com' LIMIT 1);

-- 6) Tokens vazios e e-mail confirmado (evita erro no login)
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email = 'testes@appchamo.com';
