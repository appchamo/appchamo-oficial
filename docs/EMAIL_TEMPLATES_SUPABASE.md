# Templates de e-mail no Supabase (Chamô)

E-mails de **confirmação de cadastro** e **recuperação de senha** no estilo da marca (CHAMÔ, botão laranja, aviso de segurança).

---

## Confirmação de e-mail (cadastro)

O HTML está em **`supabase/templates/confirmation.html`**.

### Usar no Supabase Cloud (Dashboard)

1. Acesse **[Supabase Dashboard](https://supabase.com/dashboard)** → seu projeto.
2. Vá em **Authentication** → **Email Templates**.
3. Selecione o template **"Confirm signup"** / **"Confirmation"**.
4. **Subject:** `Confirme seu e-mail - Chamô`
5. No campo do corpo (HTML), **cole o conteúdo** do arquivo `supabase/templates/confirmation.html`.  
   **Importante:** mantenha a variável `{{ .ConfirmationURL }}` — ela é substituída pelo link de confirmação.
6. Salve.

### Usar no Supabase local (config.toml)

No `supabase/config.toml`, descomente:

```toml
[auth.email.template.confirmation]
subject = "Confirme seu e-mail - Chamô"
content_path = "./supabase/templates/confirmation.html"
```

Reinicie o Supabase local para carregar o template.

---

## Recuperação de senha

O HTML está em **`supabase/templates/recovery.html`**.

### Usar no Supabase Cloud (Dashboard)

1. Acesse **[Supabase Dashboard](https://supabase.com/dashboard)** → seu projeto.
2. Vá em **Authentication** → **Email Templates**.
3. Selecione o template **"Reset Password"** / **"Recovery"**.
4. **Subject:** `Redefinir senha - Chamô`
5. No campo do corpo (HTML), **cole o conteúdo** do arquivo `supabase/templates/recovery.html`.  
   **Importante:** mantenha a variável `{{ .ConfirmationURL }}` — ela é substituída pelo link de redefinição.
6. Salve.

Assim o e-mail de “Esqueci minha senha” passará a sair no mesmo estilo (CHAMÔ, botão “Redefinir Senha”, aviso de segurança em 24h).

### Usar no Supabase local (config.toml)

No `supabase/config.toml`, descomente:

```toml
[auth.email.template.recovery]
subject = "Redefinir senha - Chamô"
content_path = "./supabase/templates/recovery.html"
```

Reinicie o Supabase local para carregar o template.

---

## Redirecionamento após confirmar e-mail (evitar localhost no celular)

Se, ao clicar em **“Confirmar e-mail”** no celular, o navegador abrir **localhost:8080** e der erro de conexão, o projeto Supabase está usando a URL errada.

O link de confirmação é montado pelo Supabase com a **Site URL** do projeto. Ajuste assim:

1. Acesse **[Supabase Dashboard](https://supabase.com/dashboard)** → seu projeto.
2. Vá em **Authentication** → **URL Configuration**.
3. Em **Site URL**, coloque a URL pública do seu app (ex.: `https://appchamo.com` ou `https://app.chamo.com`), **não** `http://localhost:8080`.
4. Em **Redirect URLs**, adicione a mesma URL (ex.: `https://appchamo.com/**`) para permitir o retorno após a confirmação.
5. Salve.

Depois disso, os novos e-mails de confirmação passarão a apontar para o site em produção. Quem abrir o link no celular será redirecionado para o app/site correto em vez de localhost.

---

## Variáveis (confirmação e recovery)

Em ambos os templates, as principais são:

| Variável             | Uso                          |
|----------------------|------------------------------|
| `{{ .ConfirmationURL }}` | Link de confirmação / redefinição (use no botão) |
| `{{ .Email }}`       | E-mail do usuário            |
| `{{ .SiteURL }}`     | URL do site do projeto       |
| `{{ .RedirectTo }}`  | URL de redirecionamento      |
