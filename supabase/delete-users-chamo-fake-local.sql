-- =============================================================================
-- Apagar todos os usuários cujo e-mail contém "chamo-fake.local"
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor).
--
-- Ordem: reviews → transactions → service_requests → identities → users
-- =============================================================================

-- 1) reviews (professional ou cliente = esses usuários)
DELETE FROM public.reviews
WHERE professional_id IN (
  SELECT id FROM public.professionals
  WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%')
)
   OR client_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%');

-- 2) transactions (cliente ou request desses usuários)
DELETE FROM public.transactions
WHERE client_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%')
   OR request_id IN (
     SELECT id FROM public.service_requests
     WHERE professional_id IN (SELECT id FROM public.professionals WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%'))
        OR client_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%')
   );

-- 3) service_requests (CASCADE apaga chat_messages, chat_read_status)
DELETE FROM public.service_requests
WHERE professional_id IN (SELECT id FROM public.professionals WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%'))
   OR client_id IN (SELECT id FROM auth.users WHERE email LIKE '%chamo-fake.local%');

-- 4) Identities (métodos de login)
DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email LIKE '%chamo-fake.local%'
);

-- 5) Users (CASCADE remove profiles, professionals, subscriptions, user_roles, etc.)
DELETE FROM auth.users
WHERE email LIKE '%chamo-fake.local%';
