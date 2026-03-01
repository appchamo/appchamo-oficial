# Configurar e-mail Hostinger no Supabase (verificação de conta)

Para os e-mails de verificação de conta (e recuperação de senha) saírem de **no-responda@appchamo.com** em vez do SMTP padrão do Supabase.

---

## 1. Dados SMTP da Hostinger

Use estes valores no Supabase:

| Campo | Valor |
|-------|--------|
| **Host SMTP** | `smtp.hostinger.com` |
| **Porta** | `465` (SSL) ou `587` (TLS) |
| **Usuário** | `no-responda@appchamo.com` |
| **Senha** | A senha da caixa de entrada **no-responda@appchamo.com** no painel da Hostinger |

Se a porta **465** der erro de conexão, troque para **587** e use TLS.

---

## 2. Onde configurar no Supabase

1. Acesse **[Supabase Dashboard](https://supabase.com/dashboard)** e abra o projeto.
2. No menu: **Authentication** → **SMTP** (ou **Auth** → **SMTP** / **Email**).
3. Ative **Custom SMTP** / **Enable custom SMTP**.
4. Preencha:

| Configuração no Supabase | Valor |
|--------------------------|--------|
| **Sender email** / **From address** | `no-responda@appchamo.com` |
| **Sender name** | `Chamô` (ou o nome que quiser que apareça como remetente) |
| **Host** | `smtp.hostinger.com` |
| **Port** | `465` ou `587` |
| **Username** | `no-responda@appchamo.com` |
| **Password** | Senha do e-mail no-responda na Hostinger |

5. Salve as alterações.

---

## 3. Criar o e-mail na Hostinger (se ainda não existir)

1. No **hPanel** da Hostinger: **E-mails** → **Contas de e-mail**.
2. Crie uma conta com endereço **no-responda@appchamo.com** e defina uma senha forte.
3. Use essa mesma senha no campo **Password** do SMTP no Supabase.

---

## 4. Testar

- Faça um novo cadastro com e-mail no app ou use **“Esqueci a senha”**.
- Verifique a caixa de entrada (e spam) do e-mail informado.
- O remetente deve aparecer como **Chamô** &lt;no-responda@appchamo.com&gt;.

---

## 5. Limite de envio

Com SMTP customizado, o Supabase permite **30 e-mails por hora** (ajustável em **Authentication** → **Rate limits**). Acima disso, configure o limite conforme a documentação do Supabase.

---

## 6. Reputação do domínio (recomendado)

Para reduzir risco de ir para spam, configure no painel da Hostinger (ou onde estiver o DNS do **appchamo.com**):

- **SPF** – registro TXT permitindo o servidor da Hostinger a enviar por **appchamo.com**.
- **DKIM** – se a Hostinger fornecer chave DKIM para o domínio.
- **DMARC** (opcional) – política de e-mail para o domínio.

A própria Hostinger costuma ter guia de “configurar e-mail” / “SPF/DKIM” no suporte ou no hPanel.
