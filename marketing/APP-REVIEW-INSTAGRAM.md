# Revisão do App (App Review) — liberar IA no Instagram do Chamô

Objetivo: tirar as permissões **`instagram_manage_messages`** e **`instagram_manage_comments`** do
"Pronto para teste" (Acesso Padrão) e colocar em **Acesso Avançado**, pra IA responder direct e
comentários de **qualquer pessoa** — não só de testadores.

App: **WIZ MIDIA - CLAUDE** (ID `1575920977424419`) · Perfil: **@appchamo** · Página: **Chamô**.

---

## Pré-requisitos (confere antes de enviar)
1. **App publicado / no ar (Live)** — ✅ já feito.
2. **URL da Política de Privacidade** — ✅ já feito (`https://appchamo.com/privacy`).
3. **Verificação de Negócio (Business Verification)** — provável exigência pro Acesso Avançado.
   Confere em: Meta Business Suite → **Configurações do negócio → Central de Segurança → Verificação
   de negócio**. Se pedir, envia CNPJ + documentos da Wiz Mídia/Chamô. (Pode levar alguns dias.)
4. **Uma conta de teste do Instagram** que o revisor possa usar, se ele pedir.

---

## Onde enviar
No painel do app → **Revisão do app → Permissões e recursos** (ou dentro do caso de uso "API do
Instagram", botão **Ações → Solicitar acesso avançado** em cada permissão). Adiciona as duas
permissões abaixo à mesma submissão.

---

## 1) `instagram_manage_messages`

**Como o app usa a permissão (cola no campo de justificativa):**

> O Chamô é um marketplace que conecta clientes a profissionais de serviços locais. Usamos
> `instagram_manage_messages` para oferecer atendimento automático no Direct do nosso perfil
> comercial @appchamo. Quando um usuário nos envia uma mensagem, o app recebe o evento por webhook,
> interpreta a dúvida e responde automaticamente pelo endpoint de mensagens, ajudando a pessoa a
> entender como usar o app, como contratar um profissional e para onde ir em caso de suporte. As
> mensagens são usadas exclusivamente para responder o próprio usuário; não são compartilhadas nem
> usadas para outra finalidade.

**Passo a passo pro revisor (cola no campo de instruções):**

> 1. Envie uma mensagem direta (DM) para o perfil @appchamo, por exemplo: "Como funciona o Chamô?".
> 2. Em poucos segundos o perfil responde automaticamente com uma mensagem de atendimento.
> 3. A resposta é gerada pelo nosso servidor e enviada de volta pela API de mensagens do Instagram.

---

## 2) `instagram_manage_comments`

**Como o app usa a permissão (cola no campo de justificativa):**

> Usamos `instagram_manage_comments` para ler e responder comentários nas publicações e anúncios do
> perfil comercial @appchamo. Quando alguém comenta, o app recebe o evento por webhook e responde
> publicamente no próprio comentário — tirando dúvidas sobre o serviço e direcionando ao suporte
> quando necessário. Isso melhora o atendimento e o engajamento com nossa comunidade. Os comentários
> são usados apenas para responder e moderar as interações no nosso próprio perfil.

**Passo a passo pro revisor (cola no campo de instruções):**

> 1. Comente em uma publicação do perfil @appchamo, por exemplo: "Como faço para me cadastrar?".
> 2. Em poucos segundos o app responde automaticamente ao seu comentário.
> 3. A resposta é publicada pela API de comentários do Instagram.

---

## Roteiro do vídeo de demonstração (obrigatório)

O revisor precisa ver o fluxo funcionando. Grave a tela do celular (ou screen record) mostrando,
sem cortes:

1. Abrir o Instagram e **enviar um DM** para @appchamo com uma pergunta.
2. Mostrar a **resposta automática** chegando no chat.
3. Abrir uma **publicação** do @appchamo e **comentar**.
4. Mostrar a **resposta automática** aparecendo no comentário.
5. (Opcional, reforça muito) Abrir o painel admin do Chamô → tela **Instagram (IA)** mostrando as
   duas interações registradas (o que chegou e o que a IA respondeu).

Dura 30–60s. Faz login numa conta comum (não precisa ser admin) pra mostrar que funciona pra
qualquer usuário. Sobe o vídeo no campo pedido ou como link (YouTube não listado / Drive público).

---

## Depois de enviar
- A Meta analisa em geral em **alguns dias**. Pode voltar pedindo ajuste no vídeo ou na justificativa.
- Enquanto não aprova: a IA já responde **testadores** do app. Se quiser testar antes da aprovação,
  me fala que eu te adiciono como testador (aí seu perfil aciona a IA na hora).
- Assim que aprovar, **não precisa mexer em mais nada** — a IA passa a responder todo mundo
  automaticamente (a estrutura já está toda pronta e no ar).

---

## Estado atual do que já está pronto (não precisa refazer)
- Webhook no ar e verificado ✅
- Campos assinados (messages, comments, mentions, message_reactions) ✅
- App inscrito na Página Chamô (`subscribed_apps`) ✅
- Crédito na Anthropic ✅
- Trava de segurança: só responde a conta do Chamô, não toca nos clientes da agência ✅
- Tela **Instagram (IA)** no admin pra acompanhar ✅
- App publicado + política de privacidade ✅

**Único bloqueio restante:** Acesso Avançado das 2 permissões (esta Revisão do App).
