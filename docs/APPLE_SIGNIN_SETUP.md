# Configuração: Login / Cadastro com Apple (Sign in with Apple)

O app já está preparado para usar Apple como provedor (botões "Continuar com Apple" no Login e no Cadastro). Falta apenas configurar no **Apple Developer** e no **Supabase**.

---

## Chamô – valores configurados

| Campo | Valor |
|-------|--------|
| **Team ID** | `BXRV75LQRW` |
| **Key ID** | `6P7Q6UT6M2` |
| **Services ID (Client ID no Supabase)** | `com.chamo.app.web` |
| **Return URL (no Services ID)** | `https://wfxeiuqxzrlnvlopcrwd.supabase.co/auth/v1/callback` |

No **Supabase** → **Authentication** → **Providers** → **Apple** use:
- **Client ID**: `com.chamo.app.web`
- **Secret**: JWT gerado na ferramenta com **Team ID** `BXRV75LQRW`, **Key ID** `6P7Q6UT6M2`, **Services ID** `com.chamo.app.web` e arquivo **.p8**.

---

## 1. Apple Developer Console

Acesse [developer.apple.com/account](https://developer.apple.com/account) e faça o que segue.

### 1.1 Anotar o Team ID e o Bundle ID do app

- **Team ID**: no canto superior direito do Apple Developer, ou em **Membership** → são 10 caracteres alfanuméricos (ex: `AB12CD34EF`).
- **App ID (Bundle ID)**: se o app mobile já existe, use o mesmo (ex: `com.chamo.app`). Se não, crie em **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **App IDs** → descrição "Chamô", Bundle ID `com.chamo.app` → marque **Sign in with Apple** em Capabilities → **Register**.

### 1.2 Criar um Services ID (para web / OAuth)

1. **Identifiers** → filtro **Services IDs** → **+**.
2. **Description**: ex. `Chamô Web`.
3. **Identifier**: ex. `com.chamo.app.web` (valor que será o **Client ID** no Supabase).
4. **Register**.
5. Clique no Services ID criado → marque **Sign in with Apple** → **Configure**:
   - **Primary App ID**: selecione o App ID do seu app (ex. `com.chamo.app`).
   - **Domains and Subdomains**:  
     `wfxeiuqxzrlnvlopcrwd.supabase.co`  
     (substitua pelo **Project Reference** do seu projeto Supabase se for diferente.)
   - **Return URLs**:  
     `https://wfxeiuqxzrlnvlopcrwd.supabase.co/auth/v1/callback`  
     (troque o prefixo pelo seu projeto: `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`).
6. **Save** → **Continue** → **Save**.

### 1.3 Criar uma chave (Key) para o client secret

1. **Keys** → **+**.
2. **Key Name**: ex. `Chamô Sign in with Apple`.
3. Marque **Sign in with Apple** → **Configure** → escolha o **Primary App ID** (ex. `com.chamo.app`) → **Save**.
4. **Register**.
5. **Download** do arquivo `.p8` (só pode ser baixado uma vez; guarde em local seguro).
6. Anote o **Key ID** (ex. `XY12AB34CD`).

---

## 2. Gerar o Client Secret (Apple)

Apple exige um **client secret** em formato JWT, gerado com:

- Team ID  
- Key ID (da chave criada acima)  
- Services ID (ex. `com.chamo.app.web`)  
- Arquivo `.p8`  
- Expiração (máx. 6 meses; Apple recomenda renovar a cada 6 meses)

Ferramenta recomendada (oficial, roda no navegador; não use Safari):

- **[Generate Apple Client Secret](https://supabase.com/docs/guides/auth/social-login/auth-apple#configuration)** (link na doc do Supabase; use Chrome/Firefox).

Preencha:

- **Services ID** = identifier do Services ID (ex. `com.chamo.app.web`).
- **Team ID**, **Key ID**, **.p8** (conteúdo do arquivo), **Expiration** (ex. 6 meses).

Copie o **secret** gerado (JWT longo). Você vai colá-lo no Supabase.

---

## 3. Supabase Dashboard

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto.
2. **Authentication** → **Providers** → **Apple**.
3. **Enable** Apple.
4. Preencha:
   - **Client ID (Services ID)**: ex. `com.chamo.app.web` (o mesmo do Services ID no Apple).
   - **Secret**: o JWT gerado no passo 2.
5. **Save**.

### URLs de redirecionamento (Redirect URLs)

Em **Authentication** → **URL Configuration** → **Redirect URLs**, garanta que existam:

- Web (desenvolvimento): `http://localhost:8080/login`, `http://localhost:8080/signup`
- Web (produção): `https://seu-dominio.com/login`, `https://seu-dominio.com/signup`
- App (deep link): `com.chamo.app://`, `com.chamo.app://google-auth` (usado também para Apple no app)

Assim, tanto Login quanto Cadastro com Apple vão redirecionar corretamente após o callback do Supabase.

---

## 4. Resumo do que você precisa ter

| Onde | O quê |
|------|--------|
| **Apple** | Team ID, Key ID, Services ID (ex. `com.chamo.app.web`), arquivo `.p8` |
| **Ferramenta** | Client secret (JWT) gerado com Team ID, Key ID, Services ID e .p8 |
| **Supabase** | Apple provider habilitado, Client ID = Services ID, Secret = JWT |

---

## 5. Manutenção: rotação do secret (a cada 6 meses)

Com OAuth (web / não nativo), a Apple exige que o client secret seja renovado até a cada 6 meses. Quando expirar, o login com Apple para de funcionar até você:

1. Gerar um **novo** client secret (mesma ferramenta, nova data de expiração).
2. Colar o novo secret em **Supabase** → **Authentication** → **Providers** → **Apple** → **Secret** → **Save**.

Recomendação: coloque um lembrete (calendário) para 5 meses a partir de hoje para renovar.

---

## 6. Nome do usuário (opcional)

No fluxo OAuth com Apple, o nome completo **não** vem no token. O app já trata usuário novo no cadastro (tela “Escolha o tipo de conta” e formulário com nome). Se quiser, depois do primeiro login com Apple você pode pedir o nome em um passo extra ou usar apenas o que o usuário preencher no cadastro.

---

Depois de salvar o Client ID e o Secret no Supabase, teste **Entrar com Apple** e **Criar conta** → **Continuar com Apple** na web e no app.

---

## 7. Tela branca ou erro ao voltar do Apple?

Se ao clicar em “Entrar com Apple” ou “Continuar com Apple” a tela fica branca ou aparece erro, confira no **Supabase** e no **Apple**:

### No Supabase Dashboard

1. **Authentication** → **Providers** → **Apple**
   - Apple está **Enable**?
   - **Client ID** é exatamente o **Services ID** (ex: `com.chamo.app.web`)?
   - **Secret**: JWT gerado com a ferramenta (Team ID, Key ID, Services ID e arquivo .p8). O JWT expira em até 6 meses — se expirou, gere um novo e cole de novo.

2. **Authentication** → **URL Configuration** → **Redirect URLs**
   - A URL para onde você está testando está na lista?
   - Ex.: `http://localhost:8080/login`, `http://localhost:8080/signup`, ou `https://seu-dominio.com/login`, `https://seu-dominio.com/signup`.
   - Se a URL que abre depois do Apple não estiver aí, o Supabase redireciona com erro e pode dar tela branca ou toast de “Login com rede social falhou”.

### No Apple Developer

1. **Identifiers** → **Services IDs** → seu Services ID (ex: `com.chamo.app.web`)
   - **Sign in with Apple** está marcado e **Configure** está preenchido?
   - **Domains and Subdomains**: `wfxeiuqxzrlnvlopcrwd.supabase.co` (o project ref do Supabase).
   - **Return URLs**: `https://wfxeiuqxzrlnvlopcrwd.supabase.co/auth/v1/callback` (sem barra no final).

2. A chave **.p8** que você usa para gerar o JWT está ativa e é a mesma cuja **Key ID** está no Supabase.

### Na aplicação

- Se a URL voltar com `?error=...` e `error_description=...`, o app mostra um **toast** com a mensagem em vez de tela branca. Leia a mensagem: às vezes já diz “invalid client”, “redirect_uri mismatch”, etc.
- Abra o **Console do navegador** (F12 → Console) e tente de novo: qualquer erro em vermelho ajuda a ver se o problema é no Supabase (callback), no Apple ou no app.
