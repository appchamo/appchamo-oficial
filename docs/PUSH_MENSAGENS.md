# Push de mensagens no chat

Quando um usuário envia mensagem (texto, áudio, cobrança ou comprovante), o destinatário recebe uma **notificação push** no celular (iOS e Android).

- **Título (sempre visível):** `Fulano enviou uma mensagem para você`
- **Corpo (visível ao desbloquear):** preview do conteúdo (ex.: "Oi", "Áudio", "Cobrança", "Comprovante")

Ao tocar na notificação, o app abre direto na conversa (`/messages/{threadId}`).

## O que foi implementado

1. **MessageThread** – Ao enviar mensagem de texto, áudio, cobrança ou comprovante, é inserida uma linha na tabela `notifications` com `type: "chat"` e `link: "/messages/{threadId}"`.
2. **Edge Function `send-push-notification`** – Passa o campo `link` no payload FCM (`data.link`) para o app abrir no chat ao tocar.
3. **usePush** – Listener `notificationActionPerformed` dispara o evento `chamo-notification-open` com o `link`.
4. **App** – `NotificationOpenHandler` escuta o evento e navega para o `link`.

## Webhook no Supabase (obrigatório)

Para o push ser enviado ao inserir em `notifications`, é preciso um **Database Webhook** no Supabase:

1. **Dashboard** → **Database** → **Webhooks** → **Create a new hook**
2. **Table:** `notifications`
3. **Events:** marque **Insert**
4. **Type:** HTTP Request
5. **URL:** `https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/send-push-notification`
6. **HTTP Headers:**  
   `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`  
   `Content-Type: application/json`
7. **Body (ou “Send as”):** enviar o **payload** com o novo registro, por exemplo:  
   `{"record": {"id": "...", "user_id": "...", "title": "...", "message": "...", "type": "...", "link": "..."}}`  
   (o Supabase costuma oferecer um template tipo “New record” que já manda o row como `record`)

Se o webhook não estiver configurado, a linha em `notifications` será criada (e aparecerá no centro de notificações do app), mas o **push no celular** não será disparado.

---

## Android

O mesmo fluxo (Firebase/FCM, `user_devices.push_token`, Edge Function) funciona no Android. O app já está configurado com:

- **`@capacitor-firebase/messaging`** no projeto Android (`capacitor.build.gradle`).
- **`google-services.json`** em `android/app/` (mesmo projeto Firebase que o iOS: `chamo-9cd5b`).
- **Permissão `POST_NOTIFICATIONS`** no `AndroidManifest.xml` (obrigatória no Android 13+).
- **usePush** pede permissão, obtém o token FCM e grava em `user_devices` (igual ao iOS).

### Conferir no Android

1. **Build e sync:**  
   `npm run build` → `npx cap sync android`
2. Abrir no Android Studio ou rodar em dispositivo/emulador:  
   `npx cap open android` ou `npx cap run android`
3. Fazer login no app; quando aparecer o popup **“Permitir notificações?”**, aceitar.
4. Enviar uma mensagem para esse usuário a partir de outro (ou do backend); a notificação deve chegar no Android.

O backend **send-push-notification** usa o mesmo `FIREBASE_CONFIG` (conta de serviço do projeto Firebase) para enviar tanto para tokens iOS quanto Android.

---

## Push não aparece – checklist de debug

1. **Token no banco**
   - Supabase → **Table Editor** → tabela **user_devices**.
   - Filtre pelo **user_id** do usuário que deveria receber o push.
   - Confira se existe pelo menos uma linha com **push_token** preenchido (não NULL).
   - Se estiver vazio: abra o app nesse usuário, aceite notificações e aguarde alguns segundos; o **usePush** grava o token no login.

2. **Webhook disparando**
   - Ao enviar uma mensagem no chat (ou inserir em **notifications**), o webhook deve chamar a Edge Function.
   - Supabase → **Edge Functions** → **send-push-notification** → **Logs**.
   - Veja se aparece "🚀 Nova notificação detectada para o usuário: ...". Se não aparecer, o webhook não está configurado ou a URL/headers estão errados.

3. **Resposta do FCM nos logs**
   - Nos mesmos logs da função, procure por "✅ Resposta FCM" ou "💥 FCM erro".
   - Se vier erro tipo `invalid argument` ou `unregistered`, o token pode estar expirado ou inválido (reinstale o app / faça logout e login e aceite notificações de novo).
   - Se vier `FIREBASE_CONFIG inválido`, confira o secret no Supabase (project_id, client_email, private_key).

4. **Android: permissão, canal, prioridade e app em primeiro plano**
   - No Android 13+, o app precisa da permissão **Notificações** (já tratado no projeto).
   - A Edge Function envia `android.notification.channelId: "default"` e **priority: "high"**. O app cria o canal "default" na abertura (**App.tsx** → `AndroidPushChannelInit`) e também no **usePush**.
   - No **AndroidManifest** está definido `com.google.firebase.messaging.default_notification_channel_id` = `default` para notificações em background/killed.
   - Com o **app em primeiro plano**, o FCM entrega a mensagem mas não mostra na bandeja. Por isso o **usePush** exibe uma **notificação local** (via `@capacitor/local-notifications`) quando recebe o evento `pushNotificationReceived` no Android.
   - Se ainda não aparecer: em **Configurações** do celular → **Apps** → **Chamô** → **Notificações**, confira se estão ligadas e se o canal "Notificações" não está silenciado. Desative economia de bateria / "Não perturbe" para testar.

5. **Reenviar a Edge Function**
   - Depois de alterar o código da função, faça deploy: no Supabase Dashboard, redeploy da função **send-push-notification** (ou via `supabase functions deploy send-push-notification`).
