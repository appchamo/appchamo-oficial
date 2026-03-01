# Suporte com IA (chatbot)

O suporte do Chamô tem **tópicos** (estilo chatbot) e um **assistente por IA** que responde no chat.

---

## O que foi implementado

1. **Tela de suporte**  
   Antes de abrir um ticket, o usuário escolhe um assunto:
   - Dúvidas sobre planos  
   - Problema com pagamento  
   - Erro ou dúvida no app  
   - Outro assunto  
   Ou pode abrir um "chat sem assunto específico".

2. **Assistente por IA**  
   Quando o usuário envia uma mensagem no ticket, a app chama a Edge Function **support-ai-reply**.  
   A função usa **OpenAI (GPT-4o-mini)** para gerar uma resposta e insere uma mensagem do "Assistente Chamô" no mesmo ticket.  
   O usuário vê a resposta em tempo real (realtime no Supabase).

3. **Identificação do bot**  
   Mensagens do assistente usam um `sender_id` fixo (UUID do bot). No chat elas aparecem com o rótulo **"Assistente Chamô"** e ícone de robô.

---

## Configuração (OpenAI)

1. Crie uma API key em [platform.openai.com](https://platform.openai.com/api-keys).
2. No **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**, adicione:
   - Nome: `OPENAI_API_KEY`  
   - Valor: a chave da OpenAI (ex.: `sk-...`).

3. Faça o deploy da função:
   ```bash
   supabase functions deploy support-ai-reply
   ```

Se `OPENAI_API_KEY` não estiver configurado, a função retorna erro 500 e o chat continua funcionando sem resposta da IA (o atendente humano pode responder depois).

---

## Comportamento da IA

- Responde em **português do Brasil**, de forma objetiva.
- Recebe o **assunto do ticket** (do tópico escolhido) para contextualizar.
- Se a última mensagem já for do bot, a função não gera nova resposta (evita loop).
- Modelo usado: **gpt-4o-mini** (bom custo/benefício). Para trocar o modelo, edite `support-ai-reply/index.ts` (campo `model`).

---

## Escalar para um “agent”

Se no futuro você quiser um agent (ferramentas, consulta a base de conhecimento, etc.):

- Continua usando a mesma Edge Function; troque o bloco que chama `chat/completions` por uma chamada à **API de Assistants** ou **Agent** da OpenAI, passando o histórico do ticket e as tools que o agent pode usar.
- O fluxo do app (tópicos → ticket → mensagens → invocar função) permanece; só o backend da função que passa a orquestrar o agent.
