-- Concede a role support_admin ao usuário de suporte (suporte@appchamo.com)
-- para que ele possa ver e gerenciar todos os tickets na página /suporte-desk (RLS).
-- O login continua redirecionando pelo e-mail para /suporte-desk, não para /admin.

INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'support_admin'::public.app_role
FROM public.profiles p
WHERE p.email = 'suporte@appchamo.com'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
ON CONFLICT (user_id, role) DO NOTHING;
