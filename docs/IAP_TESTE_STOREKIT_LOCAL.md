# Testar IAP com StoreKit local (Xcode)

Quando a App Store não retorna os produtos (com conta normal, Sandbox ou sem conta), você pode usar um **arquivo de configuração StoreKit** no Xcode. O app passa a usar produtos **locais** em vez dos do App Store Connect, e o fluxo de compra funciona no dispositivo/simulador.

---

## 1. Criar o arquivo StoreKit no Xcode

1. Abra o projeto no **Xcode**: `ios/App/App.xcworkspace`
2. Menu **File** → **New** → **File...**
3. Na busca, digite **storekit**
4. Selecione **StoreKit Configuration File** → **Next**
5. Nome: por exemplo **ChamoProducts**
6. **Não** marque a opção de “Synced” / sincronizar com App Store Connect (queremos arquivo **local**)
7. **Create** (pode colocar na pasta do projeto App)

---

## 2. Adicionar o grupo e as 3 assinaturas

1. No Project Navigator, clique no arquivo **ChamoProducts.storekit** (ou o nome que você deu)
2. O editor do StoreKit abre. Clique no **+** (Add) na parte de baixo
3. Escolha **Add Subscription Group** → nome: **Chamô Profissionais**
4. Com o grupo selecionado, clique de novo no **+** e adicione **Add Auto-Renewable Subscription**
5. Preencha:
   - **Reference Name:** Plano Pro  
   - **Product ID:** `com.chamo.app.pro.monthly` (exatamente assim)
   - **Subscription Group:** Chamô Profissionais
   - **Duration:** 1 month
   - **Price:** ex.: 39,90 (só para aparecer na tela)
6. Repita o **+** → **Add Auto-Renewable Subscription** para:
   - **Plano Vip** → Product ID: `com.chamo.app.vip.monthly` → 1 month → ex.: 69,90
   - **Plano Business** → Product ID: `com.chamo.app.business.monthly` → 1 month → ex.: 249,90

Os **Product IDs** precisam ser **exatamente** os mesmos do app (`src/lib/iap-config.ts`).

7. **File** → **Save** (ou Cmd+S)

---

## 3. Ativar o arquivo no Scheme

1. Menu **Product** → **Scheme** → **Edit Scheme...**
2. À esquerda: **Run**
3. Aba **Options**
4. Em **StoreKit Configuration**, escolha **ChamoProducts.storekit** (ou o nome do seu arquivo)
5. **Close**

---

## 4. Rodar o app

1. Conecte o iPhone ou use o Simulador
2. **Product** → **Run** (ou ▶️)
3. No app: **Planos** → escolha Pro, VIP ou Business → **Assinar com Apple**
4. Deve aparecer a tela de compra com os preços do arquivo local e a compra concluir sem cobrança real

Assim você valida: produtos carregam, botão habilita, compra abre e finaliza.

---

## 5. Backend (Supabase) com teste local

Com StoreKit **local**, o “receipt” é assinado pelo ambiente de teste do Xcode e **não** é válido na API da Apple. A Edge Function `validate_iap_subscription` usa `APPLE_SHARED_SECRET` e chama a Apple; com esse receipt de teste, a Apple rejeita.

Duas opções:

**A) Testar só o fluxo no app (sem ativar no backend)**  
- A compra completa no dispositivo e você vê que a tela e o fluxo estão certos.  
- A chamada ao backend pode falhar (“Receipt inválido”); a assinatura não será ativada no Supabase. Para testar a ativação no backend, use a opção B.

**B) Ativar no backend durante o teste local**  
- No Supabase, **remova temporariamente** o secret `APPLE_SHARED_SECRET` da função `validate_iap_subscription` (ou comente a validação do receipt no código da função).  
- Aí a função passa a aceitar o payload e ativa a assinatura no banco mesmo com receipt de teste.  
- **Lembre de recolocar o secret** (ou a validação) antes de usar em produção com compras reais.

---

## 6. Quando for testar com App Store / Sandbox de novo

1. **Product** → **Scheme** → **Edit Scheme** → **Run** → **Options**
2. Em **StoreKit Configuration**, volte para **None**
3. **Close** e rode de novo (ou envie novo build para TestFlight)

Assim o app volta a usar os produtos do App Store Connect.

---

## Resumo

| Objetivo                         | StoreKit Configuration |
|----------------------------------|------------------------|
| Testar fluxo no celular/simulador | **ChamoProducts.storekit** (este guia) |
| Testar com Sandbox / App Store   | **None** |

Com isso você consegue ver o fluxo de compra funcionando no seu celular mesmo quando conta normal, sem conta ou Sandbox não funcionam.
