# Validação passo a passo – Testar IAP (App Store / Sandbox)

Use este guia para conferir **todas** as configurações necessárias para os produtos da App Store carregarem no app. Marque cada item após validar.

---

## Parte 1: App Store Connect

### 1.1 Contratos e pagamento

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 1 | App Store Connect → **Acordos, impostos e banking** (menu ou rodapé) | Contrato **Aplicativos pagos** (Paid Applications) está **Ativo** | ☐ |
| 2 | Mesma seção | Dados **bancários** e **fiscais** preenchidos e aprovados (sem aviso em amarelo/vermelho) | ☐ |

**Sem contrato ativo, a Apple não disponibiliza produtos IAP.**

---

### 1.2 Grupo de assinaturas

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 3 | **Monetização** → **Assinaturas** | Existe um **Subscription Group** (ex.: Chamô Profissionais) | ☐ |
| 4 | Dentro do grupo → seção **Idioma** | **Português (Brasil)** preenchido: Nome de exibição do grupo e Nome do app | ☐ |

---

### 1.3 Cada assinatura (Pro, VIP, Business)

Para **cada uma** das três (Plano Pro, Plano Vip, Plano Business):

| # | Onde | O que verificar | Pro | VIP | Business |
|---|------|-----------------|-----|-----|----------|
| 5 | Assinaturas → clicar na assinatura | **Product ID** exatamente: `com.chamo.app.pro.monthly` / `.vip.monthly` / `.business.monthly` | ☐ | ☐ | ☐ |
| 6 | Mesma tela | **Duração:** 1 mês | ☐ | ☐ | ☐ |
| 7 | Mesma tela | **Preço** definido (Subscription Price) | ☐ | ☐ | ☐ |
| 8 | Lista de assinaturas | **Status:** "Pronto para envio" (não "Faltam metadados" nem "Developer Action Required") | ☐ | ☐ | ☐ |
| 9 | Dentro da assinatura → **Idioma / Localização** | **Português (Brasil):** Nome de exibição e Descrição preenchidos | ☐ | ☐ | ☐ |

---

### 1.4 Versão do app e build

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 10 | **App Store** → **iOS** → página da **versão** (ex.: 1.0) | Há um **build** selecionado na seção **Compilação** (ex.: build 7) | ☐ |
| 11 | Mesma página | Em **Compras dentro de apps e assinaturas** aparecem as **3 assinaturas** (Pro, VIP, Business) | ☐ |
| 12 | Menu esquerdo | **Revisão de apps** sem ícone vermelho (tudo preenchido) | ☐ |

---

## Parte 2: Xcode

### 2.1 Identidade e capabilities

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 13 | Target **App** → aba **General** → **Identity** | **Bundle Identifier** = `com.chamo.app` (exatamente) | ☐ |
| 14 | Target **App** → aba **Signing & Capabilities** | **In-App Purchase** está na lista de capabilities | ☐ |

### 2.2 StoreKit (para testar App Store real)

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 15 | **Product** → **Scheme** → **Edit Scheme…** → **Run** → aba **Options** | **StoreKit Configuration** = **None** (não use arquivo .storekit ao testar produtos reais) | ☐ |

---

## Parte 3: Dispositivo e conta

### 3.1 Onde rodar o app

| # | O que verificar | ✓ |
|---|-----------------|---|
| 16 | Teste em **iPhone físico** (não Simulador) | ☐ |
| 17 | App instalado via **TestFlight** (build da versão que tem as assinaturas) OU rodando pelo Xcode com destino **iPhone** e **StoreKit = None** | ☐ |

### 3.2 Conta Sandbox (opcional para carregar produtos; obrigatória para completar compra)

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 18 | App Store Connect → **Usuários e acesso** → **Sandbox** → **Testadores** | Existe pelo menos um **Sandbox Tester** (e-mail + senha definidos) | ☐ |
| 19 | iPhone: **Ajustes** → **App Store** | Está logado com a **conta Sandbox** OU sem conta (o popup de compra pede login na hora) | ☐ |

**Observação:** Os produtos podem carregar mesmo sem Sandbox; a Sandbox é necessária para **finalizar** a compra de teste.

---

## Parte 4: Código do app (Chamô)

| # | Onde | O que verificar | ✓ |
|---|------|-----------------|---|
| 20 | `src/lib/iap-config.ts` | Product IDs: `com.chamo.app.pro.monthly`, `com.chamo.app.vip.monthly`, `com.chamo.app.business.monthly` (sem typo) | ☐ |
| 21 | Tela **Planos** | No iOS, ao abrir o modal de assinatura, o app chama `loadProducts()` e exibe preços quando `products.length > 0`; caso contrário, mostra "Aguardando preços da App Store..." ou mensagem de erro | ☐ |

---

## Parte 5: Backend (Supabase)

| # | O que verificar | ✓ |
|---|-----------------|---|
| 22 | Edge Function **validate_iap_subscription** está **em produção** (`supabase functions deploy validate_iap_subscription`) | ☐ |
| 23 | Secret **APPLE_SHARED_SECRET** está definido no projeto (Dashboard → Edge Functions → Secrets ou `supabase secrets list`) | ☐ |

---

## Ordem sugerida para validar

1. **App Store Connect:** itens 1–12 (contratos → grupo → assinaturas → versão com build e IAPs).
2. **Xcode:** itens 13–15 (Bundle ID, In-App Purchase, StoreKit = None).
3. **Dispositivo:** itens 16–19 (iPhone, TestFlight ou Xcode, Sandbox).
4. **Código:** itens 20–21 (IDs e fluxo na tela).
5. **Backend:** itens 22–23 (função e secret).

---

## Se ainda não carregar os produtos

- Aguarde **15–30 minutos** (até 2 h) após qualquer alteração no App Store Connect.
- Confirme que o **build** que está no dispositivo é o **mesmo** da versão que tem as assinaturas.
- Se tudo estiver marcado e os produtos continuarem vazios: abra um caso no **Suporte da Apple** (App Store Connect → Ajuda → Contato) com o Bundle ID, os Product IDs e a descrição de que a App Store não retorna os produtos.
