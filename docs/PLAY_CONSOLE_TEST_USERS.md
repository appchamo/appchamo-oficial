# Usuários de teste para o Play Console

Estes usuários são para o Google analisar o app (login, fluxo cliente e profissional).

## Como criar os usuários no Supabase

1. Abra o **Supabase Dashboard** do projeto → **SQL Editor**.
2. Cole e execute o conteúdo do arquivo **`supabase/seed-play-console-users.sql`**.
3. **Requisito:** já deve existir pelo menos 1 usuário no Auth (para ter `instance_id`) e ao menos 1 categoria e 1 profissão ativas no admin.

## Erro "Database error querying schema" ao logar

Se o login retornar esse erro, os usuários foram criados por SQL e as colunas de token do Auth ficaram NULL. **Correção:** execute no SQL Editor o script **`supabase/fix-auth-users-token-columns.sql`**. Depois tente logar de novo. O seed atual já preenche esses campos; use o fix só para usuários criados antes da correção.

---

## Credenciais (envie ao Play Console ou use nos testes)

| Tipo         | E-mail                              | Senha           |
|-------------|--------------------------------------|------------------|
| **Cliente** | `play-console-cliente@chamo-app.com` | `PlayConsole2026!` |
| **Profissional** | `play-console-profissional@chamo-app.com` | `PlayConsole2026!` |

- **Cliente:** pode navegar pela Home, buscar profissionais, abrir chat, etc.
- **Profissional:** perfil aprovado, aparece na listagem, pode receber solicitações e usar o fluxo de profissional.

Se quiser trocar a senha depois, altere no Supabase (Authentication → Users → usuário → Reset password) ou use a opção “Esqueci a senha” no app.
