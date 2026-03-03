-- =============================================================================
-- Excluir usuários 100% do sistema (auth + perfis e dados em cascata)
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor).
--
-- Ordem: reviews → transactions → service_requests → identities → users (CASCADE)
-- =============================================================================

-- 1) reviews (professional ou cliente = esses usuários)
DELETE FROM public.reviews
WHERE professional_id IN (
  SELECT id FROM public.professionals
  WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com'))
)
   OR client_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com'));

-- 2) transactions (cliente ou request desses usuários)
DELETE FROM public.transactions
WHERE client_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com'))
   OR request_id IN (
     SELECT id FROM public.service_requests
     WHERE professional_id IN (SELECT id FROM public.professionals WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com')))
        OR client_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com'))
   );

-- 3) service_requests (professional ou cliente = esses usuários; CASCADE apaga chat_messages, chat_read_status)
DELETE FROM public.service_requests
WHERE professional_id IN (SELECT id FROM public.professionals WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com')))
   OR client_id IN (SELECT id FROM auth.users WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com'));

-- 4) Identities (métodos de login)
DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('raferaissa@gmail.com', 'chamotecnologia@gmail.com')
);

-- 5) Users (CASCADE remove profiles, professionals, subscriptions, etc.)
DELETE FROM auth.users
WHERE email IN (
  'raferaissa@gmail.com',
  'chamotecnologia@gmail.com'
);
