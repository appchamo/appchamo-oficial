# Modelos de WhatsApp (templates) para aprovar na Meta — Chamô

Número oficial via **WhatsApp Cloud API**. Envio já existe na função `send-whatsapp`
(`{ user_id, template: "<nome>", params: ["...","..."] }`, idioma `pt_BR`). Os `params`
preenchem `{{1}}`, `{{2}}`… na ordem.

**Regras que importam pra aprovar rápido:**
- **UTILITY** = aviso ligado a uma ação/transação do usuário (chamada, resposta, avaliação, lembrete). Aprova fácil e pode enviar fora da janela de 24h.
- **MARKETING** = promoção, reativação, cupom, dica. Precisa de opt-in e conta no limite de marketing.
- Sempre ter texto em volta das variáveis (nunca começar/terminar só com `{{1}}`).
- Idioma: **Português (BR)** · Nome do template: minúsculo_com_underscore.
- Opt-in: só dispare pra quem aceitou receber (o cadastro/termos já cobre isso).

---

## 🟢 FEEDBACK

### 1. `avaliar_servico` — UTILITY
Pedir avaliação após o serviço.
> Oi {{1}}! Como foi o serviço com {{2}} pelo Chamô? Sua avaliação ajuda outros clientes e valoriza quem faz um bom trabalho. Leva 10 segundos. ⭐
- **Botão (URL):** `Avaliar agora` → `https://appchamo.com/`
- **Exemplo:** {{1}}=João · {{2}}=Douglas (Eletricista)

### 2. `pesquisa_satisfacao` — MARKETING
NPS / satisfação geral.
> Oi {{1}}, tá gostando do Chamô? De 0 a 10, o quanto você recomendaria pra um amigo? Sua resposta ajuda a gente a melhorar. 💚
- **Botões (resposta rápida):** `Recomendo muito` · `Poderia melhorar`
- **Exemplo:** {{1}}=Maria

---

## 🔵 CLIENTE

### 3. `chamada_criada` — UTILITY
Confirma que o pedido foi enviado.
> Oi {{1}}! Sua chamada para {{2}} foi enviada pelo Chamô. Assim que o profissional responder, você é avisado aqui e no app.
- **Exemplo:** {{1}}=Maria · {{2}}=Diarista

### 4. `profissional_respondeu` — UTILITY
Profissional aceitou/respondeu.
> Boas notícias, {{1}}! O profissional {{2}} respondeu sua chamada no Chamô. Abra o app para combinar os detalhes e fechar o serviço.
- **Botão (URL):** `Abrir conversa` → `https://appchamo.com/`
- **Exemplo:** {{1}}=Maria · {{2}}=Douglas

### 5. `lembrete_agendamento` — UTILITY
Lembrete de atendimento agendado.
> Oi {{1}}, passando pra lembrar do seu atendimento com {{2}} em {{3}}. Se precisar remarcar, é só falar pelo app.
- **Exemplo:** {{1}}=João · {{2}}=Ana (Manicure) · {{3}}=amanhã às 14h

### 6. `reativacao_cliente` — MARKETING
Win-back de quem sumiu.
> Oi {{1}}, faz um tempo que você não usa o Chamô. Precisa de um profissional de confiança? Tem eletricista, diarista, pintor, borracheiro e muito mais aqui na sua região. É só chamar. 😉
- **Botão (URL):** `Encontrar profissional` → `https://appchamo.com/`
- **Exemplo:** {{1}}=Carlos

### 7. `cupom_cliente` — MARKETING
Cupom de desconto.
> Oi {{1}}! Você ganhou {{2}} de desconto no Chamô. 🎁 Válido até {{3}}. Contrate um profissional e economize.
- **Botão (URL):** `Usar cupom` → `https://appchamo.com/`
- **Exemplo:** {{1}}=Maria · {{2}}=R$ 20 · {{3}}=31/07

---

## 🟠 PROFISSIONAL

### 8. `cliente_avaliou` — UTILITY
Novo review recebido.
> Oi {{1}}, você recebeu uma nova avaliação no Chamô ⭐. Veja o que o cliente falou e continue caprichando pra aparecer mais nas buscas.
- **Botão (URL):** `Ver avaliação` → `https://appchamo.com/`
- **Exemplo:** {{1}}=Douglas

### 9. `chamada_sem_resposta` — UTILITY
Cutuca chamada parada.
> Oi {{1}}, você tem uma chamada esperando resposta há {{2}}. Responda rápido pra não perder o cliente — quem responde primeiro fecha mais serviços.
- **Botão (URL):** `Responder agora` → `https://appchamo.com/`
- **Exemplo:** {{1}}=Ana · {{2}}=2 horas

### 10. `limite_plano_pro` — MARKETING
Bateu o limite do grátis.
> Oi {{1}}, você atingiu o limite de chamadas do plano grátis e novos clientes já não conseguem te chamar. Ative o Pro e volte a receber sem limite hoje mesmo.
- **Botão (URL):** `Ativar o Pro` → `https://appchamo.com/subscriptions`
- **Exemplo:** {{1}}=Douglas

### 11. `documentos_pendentes` — UTILITY
Verificação de cadastro.
> Oi {{1}}, faltou enviar seus documentos de verificação no Chamô. Perfis verificados recebem mais chamadas e passam mais confiança. Envie pelo app em Perfil > Segurança.
- **Exemplo:** {{1}}=Carlos

### 12. `dica_profissional` — MARKETING
Dica pra receber mais clientes.
> Oi {{1}}! Dica rápida do Chamô: perfis com foto real, serviços descritos e avaliações recebem até 3x mais chamadas. Dá uma revisada no seu perfil hoje. 🚀
- **Botão (URL):** `Revisar meu perfil` → `https://appchamo.com/`
- **Exemplo:** {{1}}=Ana

---

## Como aprovar
1. **WhatsApp Manager** (business.facebook.com → WhatsApp Manager → Modelos de mensagem) → **Criar modelo**.
2. Categoria = a indicada acima · Idioma = **Português (BR)** · Nome = o `nome` do template.
3. Cola o corpo, adiciona os botões, preenche os **valores de exemplo** (obrigatório).
4. Enviar pra análise. UTILITY costuma aprovar em minutos/horas; MARKETING pode levar mais.

## Como o app dispara depois de aprovado
Chama a função `send-whatsapp` (ou o gatilho no banco) com:
`{ user_id, template: "avaliar_servico", params: ["João", "Douglas (Eletricista)"] }`
→ os `params` entram em `{{1}}`, `{{2}}`… na ordem.
