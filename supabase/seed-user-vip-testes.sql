-- =============================================================================
-- Seed: usuário de teste para revisão da Apple / Google
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor).
--
-- IMPORTANTE: essas credenciais são EXATAMENTE as mesmas fornecidas à Apple
-- no App Store Connect. Se alterar aqui, atualize também lá.
--
-- Credenciais (App Store Connect / Play Console):
--   E-mail: testes@appchamo.com
--   Senha:  Teste123@
--   Plano:  VIP | Tipo: profissional
--
-- Este script é IDEMPOTENTE: pode rodar várias vezes com segurança.
--   - Cria o usuário se não existir
--   - Se já existir, ATUALIZA a senha para 'Teste123@' (garante o match)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Criar usuário no Auth (se não existir). O trigger handle_new_user()
--    cria o profile automaticamente.
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
  COALESCE((SELECT instance_id FROM auth.users WHERE instance_id IS NOT NULL LIMIT 1),
           '00000000-0000-0000-0000-000000000000'::uuid),
  'authenticated',
  'authenticated',
  'testes@appchamo.com',
  crypt('Teste123@', gen_salt('bf')),
  jsonb_build_object('full_name', 'Testes AppChamo', 'user_type', 'professional'),
  '{}'::jsonb,
  now(),
  now(),
  now(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testes@appchamo.com');

-- 2) Se usuário já existir, REDEFINE a senha para 'Teste123@' e garante
--    que o e-mail está confirmado + tokens não-nulos (evita erro "Database
--    error querying schema" no login).
UPDATE auth.users
SET
  encrypted_password = crypt('Teste123@', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  updated_at = now()
WHERE email = 'testes@appchamo.com';

-- 3) Garante que o profile existe (caso o trigger não tenha rodado) + ajusta
--    campos para profissional VIP com CNPJ válido.
--    IMPORTANTE: marca o cadastro como "completo" (signup_completed_at +
--    accepted_terms_version) para que PostLoginGate/RedirectLoggedIn nunca
--    enviem o revisor para /signup ou /post-login.
INSERT INTO public.profiles (user_id, email, full_name, user_type, cnpj)
SELECT u.id, u.email, 'Testes AppChamo', 'professional', '54308342000100'
FROM auth.users u
WHERE u.email = 'testes@appchamo.com'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);

UPDATE public.profiles
SET
  full_name = 'Testes AppChamo',
  display_name = COALESCE(NULLIF(display_name, ''), 'Testes AppChamo'),
  user_type = 'professional',
  cnpj = '54308342000100',
  -- Marca cadastro completo para evitar redirect a /signup/post-login.
  signup_completed_at = COALESCE(signup_completed_at, now()),
  accepted_terms_at = COALESCE(accepted_terms_at, now()),
  -- Usa a versão vigente em platform_settings (terms_version_professional).
  -- Fallback para '1.0' se a chave não existir ainda.
  accepted_terms_version = COALESCE(
    NULLIF(accepted_terms_version, ''),
    (
      SELECT CASE
        WHEN value IS NULL THEN '1.0'
        WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
        ELSE trim(both '"' from value::text)
      END
      FROM public.platform_settings
      WHERE key = 'terms_version_professional'
    ),
    '1.0'
  )
WHERE email = 'testes@appchamo.com';

-- 4) Role professional (para acessar área de profissional)
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'professional'::public.app_role
FROM public.profiles p
WHERE p.email = 'testes@appchamo.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = 'professional'
  );

-- 5) Registro em professionals (categoria e profissão ativas)
INSERT INTO public.professionals (
  user_id, category_id, profession_id, bio, profile_status,
  active, verified, rating, total_reviews, total_services, availability_status
)
SELECT
  p.user_id,
  (SELECT id FROM public.categories WHERE active = true LIMIT 1),
  (SELECT id FROM public.professions WHERE active = true LIMIT 1),
  'Profissional de teste – plano VIP (revisão Apple/Google).',
  'approved',
  true,
  true,
  0,
  0,
  0,
  'available'
FROM public.profiles p
WHERE p.email = 'testes@appchamo.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.user_id
  );

-- 6) Plano VIP ativo
UPDATE public.subscriptions
SET plan_id = 'vip', status = 'active', updated_at = now()
WHERE user_id = (
  SELECT user_id FROM public.profiles WHERE email = 'testes@appchamo.com' LIMIT 1
);

-- Se não existe subscription ainda (usuário recém-criado antes do trigger
-- de subscription rodar), cria uma diretamente como VIP.
INSERT INTO public.subscriptions (user_id, plan_id, status)
SELECT p.user_id, 'vip', 'active'
FROM public.profiles p
WHERE p.email = 'testes@appchamo.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.user_id
  );

-- 7) Verificação final — deve retornar 1 linha com todos os dados OK
--    Confirme:
--      - email_confirmed = true
--      - signup_complete = true (signup_completed_at não nulo)
--      - terms_version não nulo
--      - role = professional, plan_id = vip, status = active
SELECT
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  p.full_name,
  p.user_type,
  p.cnpj,
  p.signup_completed_at IS NOT NULL AS signup_complete,
  p.accepted_terms_version AS terms_version,
  (SELECT role::text FROM public.user_roles WHERE user_id = u.id AND role = 'professional' LIMIT 1) AS role,
  pr.profile_status,
  pr.active AS professional_active,
  s.plan_id,
  s.status AS subscription_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.professionals pr ON pr.user_id = u.id
LEFT JOIN public.subscriptions s ON s.user_id = u.id
WHERE u.email = 'testes@appchamo.com';
