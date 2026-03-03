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

O trigger `handle_new_user` vai criar o perfil em `profiles` com esse e-mail. Não é necessário atribuir role em `user_roles`; o app identifica o perfil de suporte pelo e-mail.

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
