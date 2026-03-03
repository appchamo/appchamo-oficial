# Configurar Firebase para Push (FCM)

Para o push aparecer no celular, o backend (Edge Function `send-push-notification`) precisa de credenciais do Firebase. Siga estes passos.

---

## 1. Ativar a API do Cloud Messaging (FCM v1)

1. Acesse **[Firebase Console](https://console.firebase.google.com)** e selecione o projeto **chamo-9cd5b** (ou o que você usa).
2. Vá em **Configurações do projeto** (ícone de engrenagem) → **Integrações** ou **Cloud Messaging**.
3. Se aparecer **"Cloud Messaging API (Legacy)"** como desativada, não use essa; o que importa é a **API v1**.
4. Abra o **[Google Cloud Console](https://console.cloud.google.com)** com o **mesmo projeto** (selecione o projeto no topo).
5. Vá em **APIs e serviços** → **Biblioteca**.
6. Pesquise por **"Firebase Cloud Messaging API"**.
7. Clique na API e em **Ativar** (se ainda não estiver ativada).

Isso permite que o servidor envie mensagens via FCM v1.

---

## 2. Criar chave da conta de serviço (Service Account)

1. No **Firebase Console** → **Configurações do projeto** (engrenagem) → aba **Contas de serviço**.
2. Na seção **"Contas de serviço do Firebase"**, clique em **"Gerar nova chave privada"** (ou "Generate new private key") na conta padrão (ex.: `firebase-adminsdk-xxxxx@chamo-9cd5b.iam.gserviceaccount.com`).
3. Confirme e **baixe o arquivo JSON**. Esse arquivo contém `project_id`, `client_email` e `private_key`.

**Importante:** não commite esse JSON no Git. Use-o só para preencher o secret no Supabase.

---

## 3. Configurar o secret no Supabase (FIREBASE_CONFIG)

A Edge Function `send-push-notification` usa o secret **FIREBASE_CONFIG**: um JSON em uma única linha com `project_id`, `client_email` e `private_key`.

### Opção A – Pelo Dashboard do Supabase

1. Acesse **[Supabase Dashboard](https://supabase.com/dashboard)** → seu projeto.
2. Vá em **Project Settings** → **Edge Functions** (ou **Secrets**).
3. Em **Secrets**, crie ou edite:
   - **Name:** `FIREBASE_CONFIG`
   - **Value:** um JSON em **uma linha**, por exemplo:
     ```json
     {"project_id":"chamo-9cd5b","client_email":"firebase-adminsdk-xxxxx@chamo-9cd5b.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"}
     ```
   - Use os valores do arquivo JSON que você baixou. O `private_key` deve manter os `\n` (quebras de linha escapadas).

### Opção B – Script do projeto (recomendado)

1. Salve o arquivo JSON que você baixou do Firebase como **`firebase-service-account.json`** na **raiz do projeto** (ao lado de `package.json`). Esse arquivo está no `.gitignore` e não será commitado.
2. No terminal, na pasta do projeto:
   ```bash
   node scripts/prepare-firebase-config.js
   ```
3. Copie a **única linha** que aparecer no terminal.
4. No Supabase Dashboard → **Secrets** → crie o secret **FIREBASE_CONFIG** e cole essa linha como valor.

---

## 4. Conferir o Webhook (insert em `notifications`)

O push só é disparado quando uma linha é **inserida** na tabela `notifications`. Isso deve ser feito por um **Database Webhook**:

1. Supabase Dashboard → **Database** → **Webhooks** → **Create a new hook**.
2. **Table:** `notifications`
3. **Events:** marque **Insert**
4. **URL:** `https://<SEU_PROJECT_REF>.supabase.co/functions/v1/send-push-notification`
5. **Headers:**  
   `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`  
   `Content-Type: application/json`
6. **Body:** envio do novo registro (template “New record” ou payload com `record`).

Sem esse webhook, a Edge Function não é chamada e o push não sai.

---

## 5. Conferir o app (token no banco)

- No app (iOS/Android), o usuário precisa **aceitar** a permissão de notificações.
- O hook **usePush** envia o token FCM para a tabela **user_devices** (coluna **push_token**), atrelado ao **user_id**.
- A `send-push-notification` busca o dispositivo pelo **user_id** que vem em `record.user_id` e envia para o `push_token` desse dispositivo.

Se o token não estiver em `user_devices` para aquele `user_id`, o push não será enviado. Vale checar no **Table Editor** se existe linha em `user_devices` com `user_id` e `push_token` preenchidos.

---

## Resumo

| Onde | O quê |
|------|--------|
| **Google Cloud Console** | Ativar **Firebase Cloud Messaging API** (mesmo projeto do Firebase). |
| **Firebase Console** | Contas de serviço → **Gerar nova chave privada** → baixar JSON. |
| **Supabase → Secrets** | Criar **FIREBASE_CONFIG** com `project_id`, `client_email` e `private_key` (JSON em uma linha). |
| **Supabase → Webhooks** | Webhook em **Insert** na tabela **notifications** apontando para `send-push-notification`. |
| **App** | Usuário aceitar notificações; token salvo em **user_devices.push_token**. |

Depois disso, ao inserir um registro em `notifications` com `user_id` que tenha dispositivo com `push_token`, o push deve aparecer no celular.

---

## 6. iOS: som customizado (evitar som duplo)

Para o iPhone tocar **só** o som do app (ex.: `chamo_notification.caf`) e não o som padrão do sistema junto:

### O que já está no código
- A Edge Function envia para iOS **apenas** o payload **apns** (sem o bloco `notification` no topo), com `aps.sound: "chamo_notification.caf"` (só o nome do arquivo, como a Apple recomenda) e **sem** `content-available`, para evitar som duplo.

### Firebase Console
- Não existe opção de “som padrão” por app para iOS no Firebase. O som vem do payload que enviamos. Não é necessário mudar nada no Firebase para o som.

### Apple (Developer / Xcode)
- **Certificados:** Push Notifications habilitado no App ID e certificado APNs (desenvolvimento e/ou produção) configurado no Firebase (Project Settings → Cloud Messaging → Apple app configuration).
- **App:** O arquivo de som `chamo_notification.caf` deve estar no target em Xcode (**Copy Bundle Resources**). O payload usa só o nome (`"chamo_notification.caf"`), então o ideal é o arquivo ficar na **raiz do bundle** (no Xcode, no grupo **App**, não dentro de uma pasta Sounds).
- **Formato do áudio:** CAF, AIFF ou WAV; até 30 segundos; codecs suportados (Linear PCM, IMA4, aLaw, µLaw). Se o arquivo for inválido ou longo demais, o iOS pode ignorar o custom e tocar só o padrão (ou em alguns casos comportar-se de forma estranha).

### Player “Chamô” na tela de bloqueio (Now Playing)
No iOS, sons de notificação **mais longos** podem fazer o sistema mostrar o widget de “Now Playing” na tela de bloqueio (com play/pause). Apps como WhatsApp e Instagram usam sons **bem curtos** (menos de 1 segundo), e aí esse widget costuma não aparecer.

**Recomendação:** use um `chamo_notification.caf` **bem curto** (por exemplo 0,3–0,5 s), no estilo “ding” ou “pop”. Assim o comportamento fica parecido com WhatsApp/Instagram e o Now Playing tende a não aparecer. O app também limpa o Now Playing ao ser aberto (AppDelegate).

### Se ainda tocar os dois sons
1. Confirme que a função em produção está **sem** `content-available` no `aps` para notificações visíveis.
2. No iPhone: **Ajustes** → **Chamô** → **Notificações** → verifique se não há opção extra de “som” do sistema ligada em duplicidade.
3. Teste com o app **fechado** ou em **background** (não em primeiro plano), pois o comportamento pode mudar.
