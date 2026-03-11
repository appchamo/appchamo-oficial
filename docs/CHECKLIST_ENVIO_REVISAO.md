# Checklist antes de enviar para revisão (Chamô)

Use este checklist para garantir que está tudo certo antes de clicar em "Enviar para revisão".

---

## 1. Xcode

| Item | Como verificar | ✓ |
|------|----------------|---|
| **StoreKit Configuration = None** | Product → Scheme → Edit Scheme → Run → **Options** → StoreKit Configuration = **None** (não use ChamoProducts.storekit) | ☐ |
| **Versão e Build** | Target App → General → **Version** (ex.: 1.0) e **Build** (número maior que o último enviado, ex.: 7) | ☐ |
| **In-App Purchase** | Signing & Capabilities → lista **In-App Purchase** | ☐ |
| **Só iPhone** (opcional) | General → Supported Destinations = só iPhone, se quiser app só para iPhone | ☐ |

---

## 2. Build e upload

| Item | Como fazer | ✓ |
|------|------------|---|
| **Build do app** | No projeto: `npm run build` e `npx cap sync ios` (para ter o código mais recente) | ☐ |
| **Archive** | Xcode → Product → **Archive** | ☐ |
| **Upload** | Organizer → selecionar o archive → **Distribute App** → App Store Connect → **Upload** | ☐ |
| **Aguardar processamento** | App Store Connect → build aparece em “Processando” e depois fica disponível para selecionar na versão | ☐ |

---

## 3. App Store Connect – Versão do app

| Item | Onde | ✓ |
|------|------|---|
| **Build selecionado** | Página da versão (ex.: 1.0) → seção **Compilação** → build mais recente (ex.: 7) selecionado | ☐ |
| **3 assinaturas na versão** | Mesma página → **Compras dentro de apps e assinaturas** → Pro, VIP e Business listados | ☐ |
| **Revisão de apps** | Menu esquerdo → **Revisão de apps** → sem ícone vermelho; login (testes@appchamo.com), contato e notas preenchidos | ☐ |
| **Capturas e metadados** | Pré-visualizações, descrição, texto promocional, etc. preenchidos conforme exigido | ☐ |

---

## 4. Backend (Supabase)

| Item | Verificação | ✓ |
|------|-------------|---|
| **Função no ar** | `validate_iap_subscription` em produção (`supabase functions deploy validate_iap_subscription`) | ☐ |
| **Secret configurado** | `APPLE_SHARED_SECRET` definido (Supabase Dashboard → Edge Functions → Secrets ou `supabase secrets set`) | ☐ |

---

## 5. Comportamento do app

| Item | Verificação | ✓ |
|------|-------------|---|
| **Fluxo IAP no código** | No iOS, tela Planos mostra “Assinar com Apple” e chama a função após a compra (já validado no teste local) | ☐ |
| **Sem StoreKit local no envio** | Ao rodar com StoreKit = None, o app usa produtos do App Store Connect (revisor verá o fluxo real) | ☐ |

---

## 6. Notas para o revisor (recomendado)

Na seção **Revisão de apps**, em **Notas**, inclua algo como:

- "Para testar as assinaturas: acesse a aba **Perfil** → **Planos**. Toque em um plano (Pro, VIP ou Business) e em **Assinar com Apple**. Pode usar uma conta Sandbox se solicitado. Login de teste do app: testes@appchamo.com / [senha]."

---

## Resumo

- **Xcode:** StoreKit = **None**, Version/Build ok, In-App Purchase na capability.
- **Build:** `npm run build` + `cap sync` → Archive → Upload.
- **App Store Connect:** Build na versão, 3 IAPs na versão, Revisão de apps completa, capturas/metadados ok.
- **Supabase:** Função `validate_iap_subscription` no ar e `APPLE_SHARED_SECRET` configurado.

Quando todos os itens estiverem marcados, pode clicar em **Enviar para revisão**.
