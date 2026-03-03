# Notification Service Extension (iOS) – som único

Para o iPhone tocar **apenas** o som do Chamô (`chamo_notification.caf`) e não o som padrão junto, usamos uma **Notification Service Extension** que reescreve o som da notificação antes de exibir.

A Edge Function já envia `"mutable-content": 1` no payload para iOS; falta só adicionar o target da extensão no Xcode.

---

## Passo a passo no Xcode

1. Abra o projeto iOS:  
   `npx cap open ios`

2. No Xcode: **File** → **New** → **Target…**

3. Em **iOS** escolha **Notification Service Extension** → **Next**.

4. **Product Name:** `NotificationServiceExtension`  
   **Team** e **Bundle Identifier:** use o mesmo do app (ex.: `com.chamo.app.NotificationServiceExtension`).  
   → **Finish**.

5. Se aparecer **“Activate scheme?”**, clique em **Activate**.

6. No projeto, abra o arquivo **NotificationService.swift** que o Xcode criou dentro da pasta da nova target (ex.: `NotificationServiceExtension/NotificationService.swift`).

7. **Substitua todo o conteúdo** desse arquivo pelo conteúdo do arquivo que está em:  
   `ios/App/NotificationServiceExtension/NotificationService.swift`  
   (no seu projeto, na pasta da extensão que o Xcode criou).

8. O som **`chamo_notification.caf`** precisa estar no **app principal** (target **App**), em **Copy Bundle Resources**, para a extensão poder usá-lo. A extensão usa o bundle do app para o som.

9. Faça **build** do projeto (Cmd+B). Corrija erros de signing se o Xcode pedir (escolher o mesmo Team do app para a extensão).

---

## O que a extensão faz

- É chamada pelo sistema quando chega uma push com `mutable-content: 1`.
- Copia o conteúdo da notificação e define:  
  `sound = UNNotificationSound(named: "chamo_notification.caf")`.
- Entrega esse conteúdo modificado; o sistema exibe a notificação e toca **só** esse som.

Assim evitamos o som padrão do iPhone tocando junto com o `chamo_notification.caf`.
