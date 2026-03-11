# In-App Purchase (IAP) – Chamô

Este documento descreve como configurar e usar In-App Purchase no app Chamô (iOS e, no futuro, Android), em conformidade com a Guideline 3.1.1 da Apple.

## Visão geral

- **iOS**: Assinaturas são vendidas via App Store (StoreKit 2). Na tela **Planos**, em dispositivos iOS, o usuário vê preços da App Store e assina com **Assinar com Apple**.
- **Web / outros**: Continua disponível o fluxo com cartão (Asaas) na mesma tela.
- **Backend**: A Edge Function `validate_iap_subscription` valida o receipt (opcional) e ativa a assinatura no Supabase.

## 1. App Store Connect

### 1.1 Criar produtos de assinatura

1. Acesse [App Store Connect](https://appstoreconnect.apple.com) → seu app → **In-App Purchases**.
2. Crie um **Subscription Group** (ex.: `Chamo Plans`).
3. Dentro do grupo, crie **3 assinaturas auto-renováveis** (mensal) com os IDs abaixo.

| Plano     | Product ID (Identifier)     |
|----------|-----------------------------|
| Pro      | `com.chamo.app.pro.monthly` |
| VIP     | `com.chamo.app.vip.monthly` |
| Business | `com.chamo.app.business.monthly` |

4. Defina preços, período (1 mês) e metadados (nome, descrição) para cada um.
5. **App-Specific Shared Secret** (para validação no backend):  
   Em **App Information** → **App-Specific Shared Secret**, gere ou copie o valor.  
   Configure no Supabase (Edge Functions) a variável de ambiente:  
   `APPLE_SHARED_SECRET` = esse valor.

### 1.2 Contrato e impostos

- Ative **Paid Applications** e **In-App Purchases** no **Contracts, Tax, and Banking**.
- Preencha dados fiscais e bancários para receber pagamentos.

## 2. Xcode (projeto iOS)

1. Abra o projeto em Xcode: `ios/App/App.xcworkspace` (ou `.xcodeproj`).
2. Selecione o **target do app** (ex.: App).
3. Aba **Signing & Capabilities**.
4. Clique em **+ Capability** e adicione **In-App Purchase**.

Sem essa capability, as compras não funcionam no dispositivo.

## 3. Testes no iOS

### Sandbox

1. Em App Store Connect → **Users and Access** → **Sandbox** → **Testers**, crie um **Sandbox Tester** (Apple ID de teste).
2. No iPhone: **Ajustes** → **App Store** → faça logout da sua Apple ID.
3. Ao tocar em **Assinar com Apple** no app, use o e-mail e a senha do Sandbox Tester quando a Apple pedir.

### StoreKit Local Testing (opcional)

- Em Xcode: **Product** → **Scheme** → **Edit Scheme** → **Run** → **Options** → **StoreKit Configuration**.
- Crie um arquivo `.storekit` com produtos com os mesmos IDs (`com.chamo.app.pro.monthly`, etc.) para testar sem conta sandbox.

## 4. Backend (Supabase)

### Edge Function: `validate_iap_subscription`

- **URL**: `https://<project>.supabase.co/functions/v1/validate_iap_subscription`
- **Método**: POST.
- **Headers**: `Authorization: Bearer <JWT do usuário>`, `Content-Type: application/json`.
- **Body** (exemplo):
  ```json
  {
    "userId": "uuid-do-usuario",
    "planId": "pro",
    "transactionId": "1000000123456789",
    "productIdentifier": "com.chamo.app.pro.monthly",
    "receipt": "base64-do-receipt-ios",
    "platform": "ios"
  }
  ```
- Se `APPLE_SHARED_SECRET` estiver definido, a função valida o `receipt` com a Apple antes de ativar.  
  Se não estiver definido, a ativação é feita sem validação (apenas para desenvolvimento).

### Deploy da função

```bash
supabase functions deploy validate_iap_subscription
```

Defina o secret no projeto:

```bash
supabase secrets set APPLE_SHARED_SECRET="seu-app-specific-shared-secret"
```

## 5. Código no app

- **IDs dos produtos**: `src/lib/iap-config.ts`  
  Altere `IAP_PRODUCT_IDS` se criar outros IDs no App Store Connect.
- **Hook IAP**: `src/hooks/useIAP.ts` – carrega produtos, compra, restaura.
- **Tela Planos**: `src/pages/Subscriptions.tsx` – no iOS usa IAP; na web usa cartão (Asaas).

## 6. Cancelamento / gerenciar assinatura

O usuário pode cancelar ou alterar a assinatura nas configurações da Apple:

- **Configurações** → **Apple ID** → **Assinaturas** → Chamô.

No app, o botão **Cancelar assinatura** (no plano atual) apenas volta o plano para **Free** no nosso backend; o cancelamento do cobramento é feito pela Apple (acima). Para abrir a tela de assinaturas da Apple programaticamente, use no futuro `NativePurchases.manageSubscriptions()` (já exposto no `useIAP`).

## 7. Android (futuro)

Para Google Play, será necessário:

- Criar produtos de assinatura no **Google Play Console** com os mesmos “planos” (Pro, VIP, Business).
- No código, usar o mesmo `useIAP` com `planIdentifier` (Base Plan ID) para cada produto no `purchase()`.
- Backend: validar com a Google Play Developer API (token de compra) em uma função equivalente a `validate_iap_subscription`.

Os Product IDs e o `planIdentifier` do Android podem ser configurados em `src/lib/iap-config.ts` e no hook quando a loja Google for integrada.

---

## 8. Troubleshooting: "Cannot find product for id"

Se o app mostrar **"Cannot find product for id com.chamo.app.xxx.monthly"** ou o botão ficar em **"Aguardando preços da App Store..."**:

### 8.1 StoreKit Configuration no Xcode (muito comum)

Se no Xcode estiver configurado um **StoreKit Configuration** para testes locais, a App Store **não** é usada e os produtos reais não aparecem.

1. No Xcode: **Product** → **Scheme** → **Edit Scheme…**
2. Selecione **Run** (à esquerda) → aba **Options**.
3. Em **StoreKit Configuration**, escolha **None** (não use um arquivo `.storekit`).
4. Feche e rode de novo (ou gere novo build para TestFlight).

### 8.2 Contrato e impostos

- **App Store Connect** → **Acordos, impostos e banking**.
- O contrato **Aplicativos pagos** (Paid Applications) deve estar **Ativo**.
- Impostos e dados bancários preenchidos e aprovados. Sem isso, a Apple não disponibiliza os produtos.

### 8.3 Assinaturas na versão do app

- Na **página da versão** do app (ex.: 1.0), em **Compras dentro de apps e assinaturas**, as 3 assinaturas devem estar **adicionadas**.
- A versão deve ter um **build** selecionado. Sem build + assinaturas na versão, os produtos podem não ser retornados.

### 8.4 Idioma do grupo de assinaturas

- Em **Assinaturas** → seu grupo (ex.: Chamô Profissionais) → seção **Idioma**.
- O idioma (ex.: Português Brasil) deve estar **Preparar para envio** completo (nome do grupo, nome do app). Conclua e salve.

### 8.5 Teste em dispositivo real

- Use **iPhone físico** (não Simulador).
- **Ajustes** → **App Store** → saia da Apple ID ou use uma **conta Sandbox** ao ser solicitado na compra.

### 8.6 Propagação

Após alterações no App Store Connect, pode levar **até 1–2 horas** para os produtos ficarem disponíveis. Teste de novo depois de um tempo.
