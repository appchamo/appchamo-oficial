# Push de mensagens no chat

Quando um usuário envia mensagem (texto, áudio, cobrança ou comprovante), o destinatário recebe uma **notificação push** no celular.

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
