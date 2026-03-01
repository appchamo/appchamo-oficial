# Ajustar limite de cadastros (429) no Supabase

Quando aparecer **"Muitas tentativas"** ou **429** no cadastro, o Supabase está limitando requisições por **IP** e por **envio de e-mail**.

## Onde configurar (Supabase Cloud)

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard).
2. Abra o projeto (ex.: **Chamô**).
3. No menu: **Authentication** → **Rate limits** (ou **Configuration** → **Auth** → **Rate limits**).
4. Aumente, por exemplo:
   - **Sign ups and sign-ins** – ex.: 60 ou 100 em 5 minutos por IP.
   - Se usar confirmação de e-mail: o limite de **e-mails por hora** costuma ser 2; para aumentar, é preciso configurar **SMTP próprio** em **Project Settings** → **Auth** → **SMTP**.

## Limites que afetam o cadastro

| Limite              | Padrão (ex.)     | Observação                    |
|---------------------|------------------|--------------------------------|
| Sign up / Sign in   | 30 em 5 min / IP | Ajustável no Dashboard.        |
| E-mails enviados    | 2 por hora       | Só aumenta com SMTP custom.    |

## Teste rápido

- **Celular em 4G** (fora do Wi‑Fi): outro IP, pode funcionar enquanto o Wi‑Fi estiver limitado.
- **Aguardar** 5–60 minutos e tentar de novo no mesmo IP.

## Self-hosted (config.toml)

No `supabase/config.toml`, em `[auth.rate_limit]`:

- `sign_in_sign_ups = 30` → aumente (ex.: `60`) para mais cadastros por IP a cada 5 minutos.
- `email_sent = 2` → só sobe com SMTP configurado em `[auth.email.smtp]`.

Depois, reinicie o Supabase local ou faça redeploy se for self-hosted em produção.
