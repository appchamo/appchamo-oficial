# Templates de e-mail no Supabase (Chamô)

E-mail de **recuperação de senha** no estilo da marca (CHAMÔ, botão laranja, aviso de segurança).

---

## Recuperação de senha (já criado)

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

## Variáveis disponíveis (recovery)

| Variável             | Uso                          |
|----------------------|------------------------------|
| `{{ .ConfirmationURL }}` | Link para redefinir a senha (use no botão) |
| `{{ .Email }}`       | E-mail do usuário            |
| `{{ .SiteURL }}`     | URL do site do projeto       |
| `{{ .RedirectTo }}`  | URL de redirecionamento      |

Não remova `{{ .ConfirmationURL }}` do template.
