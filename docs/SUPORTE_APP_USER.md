# Usuário de Suporte (app)

O perfil **Suporte** acessa apenas a tela de atendimento (Central de Atendimento), sem Home nem Admin.

## Credenciais

- **E-mail:** `suporte@appchamo.com`
- **Senha:** `suporte123`

## Criar o usuário no Supabase

1. No **Supabase Dashboard** → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Preencha:
   - **Email:** `suporte@appchamo.com`
   - **Password:** `suporte123`
   - **Auto Confirm User:** marcado
3. Crie o usuário.

O trigger `handle_new_user` vai criar o perfil em `profiles` com esse e-mail.

## Permitir que o suporte veja todos os tickets (RLS)

O app identifica o perfil de suporte pelo e-mail, mas as tabelas `support_tickets` e `support_messages` têm RLS: só **admins** veem todos os chamados. Por isso é preciso dar a role **support_admin** ao usuário de suporte.

**Opção A – Rodar a migration (se usar Supabase CLI):**
```bash
supabase db push
```

**Opção B – Rodar o SQL no Supabase (Dashboard → SQL Editor):**
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'support_admin'::public.app_role
FROM public.profiles p
WHERE p.email = 'suporte@appchamo.com'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
ON CONFLICT (user_id, role) DO NOTHING;
```

Depois disso, o usuário de suporte passa a ver e responder a todas as solicitações na Central de Atendimento.

## Comportamento no app

- Login com esse e-mail redireciona para **/suporte-desk** (Central de Atendimento).
- O usuário vê apenas:
  - Lista de chamados de suporte e denúncias (mesma tela do Admin → Suporte).
  - Botão **Notificações** no header (abre `/suporte-desk/notificacoes`).
  - Botão **Sair** (logout).
- Não acessa Home, Admin nem o restante do app.
- Quando um cliente abre uma nova solicitação de suporte, uma notificação é enviada para esse usuário.

## Rotas

- `/suporte-desk` — Central de Atendimento (suporte + denúncias).
- `/suporte-desk/notificacoes` — Notificações do usuário de suporte.

Acesso a essas rotas é permitido apenas para o usuário com e-mail `suporte@appchamo.com`; outros usuários logados são redirecionados para `/home`.
