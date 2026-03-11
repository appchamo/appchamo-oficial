# Checklist de validação – In-App Purchase (Chamô)

Use este checklist para garantir que tudo está configurado. Marque cada item após conferir.

---

## 1. App Store Connect – Contratos e pagamento

| Item | Onde verificar | Status |
|------|----------------|--------|
| Contrato **Aplicativos pagos** (Paid Applications) está **Ativo** | **Acordos, impostos e banking** (menu superior ou no rodapé) → Contratos | ☐ |
| Dados bancários e fiscais preenchidos e **aprovados** | Mesma seção | ☐ |

**Sem contrato ativo, a Apple não disponibiliza produtos IAP.**

---

## 2. App Store Connect – Grupo de assinaturas

| Item | Onde verificar | Status |
|------|----------------|--------|
| Existe um **Subscription Group** (ex.: Chamô Profissionais) | **Monetização** → **Assinaturas** | ☐ |
| As 3 assinaturas estão **dentro** desse grupo | Mesma página, tabela do grupo | ☐ |
| Seção **Idioma** do grupo preenchida | Dentro do grupo → **Idioma** → Português (Brasil): Nome de exibição do grupo e Nome do app | ☐ |

---

## 3. App Store Connect – Cada assinatura (Pro, VIP, Business)

Para **cada uma** das 3 (Plano Pro, Plano Vip, Plano Business):

| Item | Onde verificar | Status |
|------|----------------|--------|
| **Product ID** é exatamente: `com.chamo.app.pro.monthly` / `com.chamo.app.vip.monthly` / `com.chamo.app.business.monthly` | Assinaturas → clique na assinatura | ☐ Pro ☐ VIP ☐ Business |
| **Duração**: 1 mês | Mesma tela | ☐ |
| **Preço** definido (Subscription Price) | Mesma tela | ☐ |
| **Status**: "Pronto para envio" (não "Faltam metadados") | Lista de assinaturas | ☐ |
| **Localização** (Português Brasil): Nome de exibição e Descrição preenchidos | Dentro da assinatura → Idioma / Localization | ☐ |

---

## 4. App Store Connect – Versão do app (1.0 ou 1.1)

| Item | Onde verificar | Status |
|------|----------------|--------|
| Há uma **Compilação (Build)** selecionada | Página da versão → seção **Compilação** | ☐ |
| As **3 assinaturas** aparecem em **Compras dentro de apps e assinaturas** | Mesma página → **Compras dentro de apps e assinaturas** | ☐ |
| **Revisão de apps** sem ícone vermelho | Menu esquerdo → **Revisão de apps** (clicar e preencher tudo que estiver obrigatório) | ☐ |

**Importante:** O ícone vermelho em **Revisão de apps** indica campo obrigatório faltando (contato, conta de demonstração, notas, etc.). Preencha tudo até o aviso sumir.

---

## 5. Xcode – Projeto iOS

| Item | Onde verificar | Status |
|------|----------------|--------|
| **Bundle Identifier** = `com.chamo.app` (exatamente) | Target do app → **General** → **Identity** | ☐ |
| Capability **In-App Purchase** adicionada | Target → **Signing & Capabilities** → deve listar "In-App Purchase" | ☐ |
| **StoreKit Configuration** = **None** (ao testar IAP real) | **Product** → **Scheme** → **Edit Scheme** → **Run** → **Options** → StoreKit Configuration | ☐ |

---

## 6. Código do app (Chamô)

| Item | Arquivo | Valor esperado |
|------|---------|----------------|
| IDs dos produtos | `src/lib/iap-config.ts` | `com.chamo.app.pro.monthly`, `com.chamo.app.vip.monthly`, `com.chamo.app.business.monthly` |

(Se você não alterou o código, isso já está correto.)

---

## 7. Teste no dispositivo

| Item | Verificação | Status |
|------|-------------|--------|
| Teste em **iPhone físico** (não Simulador) | - | ☐ |
| App instalado via **TestFlight** (build da mesma versão que tem as assinaturas) | - | ☐ |
| No iPhone: **Ajustes** → **App Store** → conta **Sandbox** (ou sair da Apple ID para pedir no momento da compra) | - | ☐ |
| Aguardar **15–30 min** (ou até 2 h) após salvar a versão com build + IAP | - | ☐ |

---

## Resumo do que costuma faltar

1. **Revisão de apps** com ícone vermelho → abrir e preencher todos os campos obrigatórios.
2. **StoreKit Configuration** no Xcode diferente de **None** → colocar **None** ao testar IAP real.
3. **Contrato Paid Applications** inativo ou dados bancários/fiscais pendentes.
4. **Idioma** do grupo de assinaturas ou de alguma assinatura incompleto.

Depois de marcar tudo, gere um **novo build**, envie para o TestFlight, instale no iPhone e teste de novo.
