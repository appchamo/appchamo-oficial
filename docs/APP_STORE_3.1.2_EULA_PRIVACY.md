# Guideline 3.1.2(c) – Termos de Uso (EULA) e Política de Privacidade

A Apple exige que apps com assinaturas auto-renováveis incluam **links funcionais** para Política de Privacidade e Termos de Uso (EULA) **nos metadados do App Store** (e no próprio app).

## O que já foi feito no app

- Na tela **Planos** (Perfil → Planos): texto “Assinatura mensal com renovação automática” e links para **Termos de Uso (EULA)** e **Política de Privacidade** (rotas `/terms-of-use` e `/privacy`).
- No **modal de pagamento** (Assinar com Apple): mesma informação e os mesmos links antes do botão de assinar.

## O que você precisa fazer no App Store Connect

### 1. Política de Privacidade (obrigatório)

- Em **App Store Connect** → sua app → **App Information** (ou na página da versão).
- No campo **Privacy Policy URL** (URL da Política de Privacidade), coloque um **link que funcione** para a sua política de privacidade.

**Como obter a URL:**

- Se o app web está em produção (ex.: `https://appchamo.com`), use:
  - **https://appchamo.com/privacy**  
  (a rota `/privacy` do seu app já exibe a Política de Privacidade.)
- Se você tem um site institucional com página de privacidade, use a URL dessa página (ex.: `https://seudominio.com/privacidade`).

O link deve abrir em um navegador e mostrar a política de privacidade.

---

### 2. Termos de Uso (EULA) – uma das duas opções

A Apple aceita **uma** das formas abaixo.

#### Opção A: EULA padrão da Apple

- Se você **não** tem termos de uso próprios e aceita o EULA padrão da Apple:
  - Em **App Store Connect** → sua app → **Versão** (ex.: 1.1) → **App Description** (descrição do app).
  - Inclua na descrição um texto como:

    **English:**  
    `Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`

  - Assim o revisor vê o “link funcional” aos Termos de Use (EULA) na descrição.

#### Opção B: EULA customizado (seus termos)

- Se você usa **seus próprios** Termos de Uso:
  - Em **App Store Connect** → sua app → **App Information** (ou onde estiver o campo **EULA**).
  - Preencha o campo **EULA** com o texto completo dos seus Termos de Uso, **ou**
  - Coloque na **App Description** um link funcional para a página dos seus termos (ex.: `https://appchamo.com/terms-of-use` ou `https://seudominio.com/termos`).

Recomendação: se os termos já estão no app em `/terms-of-use`, use a mesma URL pública (ex.: `https://appchamo.com/terms-of-use`) na descrição, para manter consistência.

---

### 3. Conferir antes de enviar

| Item | Onde | O que fazer |
|------|------|-------------|
| **Privacy Policy** | App Store Connect → Privacy Policy URL | URL que abre a política de privacidade (ex.: `https://appchamo.com/privacy`). |
| **Terms of Use (EULA)** | App Description **ou** campo EULA | Opção A: na descrição, incluir link para o EULA padrão da Apple. Opção B: EULA customizado no campo EULA ou link na descrição para seus termos. |
| **No app** | Tela Planos + modal de pagamento | Já implementado: “Assinatura mensal”, links para Termos de Uso (EULA) e Política de Privacidade. |

Depois de preencher **Privacy Policy URL** e **Terms of Use (EULA)** conforme acima, salve e envie a versão para revisão novamente.
