# O que configurar no Asaas para o Chamô

O app usa o Asaas para: **validação de CPF/CNPJ** no cadastro do profissional, **pagamentos** (PIX/cartão) e **assinaturas** (planos de profissional). Abaixo o que você precisa fazer na conta Asaas e no Supabase.

---

## 1. Conta Asaas

- **Testes:** crie uma conta no **Sandbox** (ambiente de testes): [https://sandbox.asaas.com](https://sandbox.asaas.com)  
- **Produção:** use a conta em [https://www.asaas.com](https://www.asaas.com)

---

## 2. Chave de API (obrigatório)

1. Entre no painel do Asaas (Sandbox ou Produção).
2. Menu do usuário (canto superior direito) → **Integrações**.
3. Clique em **Gerar nova chave de API**.
4. Copie a chave **na hora** (ela só aparece uma vez).
5. No **Supabase**: **Project Settings** → **Edge Functions** → **Secrets** (ou “Environment variables”).
6. Crie o secret:
   - Nome: **`ASAAS_API_KEY`**
   - Valor: a chave que você colou.

Só usuários **administradores** da conta Asaas podem gerar chaves. Em Sandbox e Produção as chaves são diferentes; use a chave do ambiente que você está usando.

---

## 3. Ambiente (Sandbox vs Produção)

- **`ASAAS_ENV`** (opcional nos secrets do Supabase):
  - **`sandbox`** (padrão) – usa **`https://api-sandbox.asaas.com/v3`** (testes).
  - **`production`** – usa **`https://api.asaas.com/v3`** (cobranças reais).

A URL do sandbox para **chamadas à API** é `api-sandbox.asaas.com`; o site para criar conta e gerar chave é [sandbox.asaas.com](https://sandbox.asaas.com). Use a chave gerada no painel Sandbox quando `ASAAS_ENV` for sandbox.

---

## 4. Webhook (para assinaturas e pagamentos)

O Chamô tem a Edge Function **`asaas_webhook`**, que recebe notificações do Asaas (pagamento confirmado, assinatura ativada, etc.). Se o Asaas retornar **401 Unauthorized** nos detalhes do webhook, é porque a validação do token falhou.

1. No Asaas: **Integrações** → **Webhooks** (ou **Notificações**).
2. Cadastre a URL: `https://<SEU_PROJECT_REF>.supabase.co/functions/v1/asaas_webhook`
3. Marque os eventos que você usa (ex.: PAYMENT_CREATED, PAYMENT_RECEIVED, PAYMENT_CONFIRMED, SUBSCRIPTION_UPDATED).
4. **Token (AccessToken):**
   - **Se você NÃO configurou** um token no Asaas: não crie o secret `ASAAS_WEBHOOK_TOKEN` no Supabase; a função aceita o webhook sem token.
   - **Se você configurou** um token no Asaas: crie no Supabase o secret **`ASAAS_WEBHOOK_TOKEN`** com **exatamente o mesmo valor**. O Asaas envia no header `asaas-access-token`; se for diferente, a função devolve 401.

---

## 5. Resumo no Supabase (Secrets)

| Nome                 | Obrigatório | Descrição                                      |
|----------------------|------------|------------------------------------------------|
| **ASAAS_API_KEY**    | Sim        | Chave de API (Integrações → Gerar chave).     |
| **ASAAS_ENV**        | Não        | `sandbox` (padrão) ou `production`.           |
| **ASAAS_WEBHOOK_TOKEN** | Não    | Só se você configurou token no webhook Asaas. |

---

## 6. Erro 401 Unauthorized do Asaas

Se ao aprovar assinatura ou em outras chamadas aparecer `{ "error": "Unauthorized" }` ou `invalid_access_token`:

1. **URL correta:** Sandbox deve usar `https://api-sandbox.asaas.com/v3` (não `sandbox.asaas.com`). O app já usa essa URL quando `ASAAS_ENV` é sandbox.
2. **Chave do mesmo ambiente:** Use a chave gerada em **Integrações** no painel **Sandbox** para testes; para produção, use a chave de produção.
3. **Chave completa:** A chave pode começar com `$` (ex.: `$aact_hmlg_...`). Ao colar no Supabase Secrets, não remova o `$`.
4. **Redeploy:** Depois de alterar os secrets no Supabase, faça redeploy das Edge Functions que usam Asaas (`admin-manage`, `create_subscription`, `create_payment`, `validate-cpf-signup`) para carregarem a nova variável.

---

## 7. Validação de CPF no cadastro

A validação de CPF/CNPJ do **profissional** usa a mesma **ASAAS_API_KEY**: a Edge Function **validate-cpf-signup** chama `POST /customers` no Asaas. Se o Asaas aceitar (200), o documento é considerado válido e o `asaas_customer_id` é salvo no perfil. Não é preciso configurar nada extra no Asaas só para o CPF; basta a chave de API e o deploy da função (com CORS ajustado).

---

## 8. Passar o Asaas para produção (estava em sandbox)

Para usar cobranças e assinaturas **reais**:

1. **Conta Asaas produção**  
   Tenha uma conta em [www.asaas.com](https://www.asaas.com) (não use a do sandbox).

2. **Chave de API de produção**  
   No painel **www.asaas.com** → Integrações → Gerar nova chave de API. Copie a chave (ela só aparece uma vez).

3. **Secrets no Supabase**  
   Dashboard do Supabase → **Edge Functions** → **Secrets** (ou Project Settings → Edge Functions):
   - **`ASAAS_API_KEY`** → troque pelo valor da chave de **produção** (substitui a chave do sandbox).
   - **`ASAAS_ENV`** → crie ou edite e defina como **`production`** (texto exatamente assim, minúsculo).  
   Se `ASAAS_ENV` não existir, o app usa sandbox; ao definir `production`, as funções passam a usar `https://api.asaas.com/v3`.

4. **Webhook no Asaas produção**  
   No painel **www.asaas.com** → Integrações → Webhooks:
   - URL: `https://<SEU_PROJECT_REF>.supabase.co/functions/v1/asaas_webhook`
   - Eventos: PAYMENT_CONFIRMED, SUBSCRIPTION_UPDATED (e outros que você usar).
   - Se configurar um token (AccessToken), crie no Supabase o secret **`ASAAS_WEBHOOK_TOKEN`** com o mesmo valor.

5. **Redeploy das Edge Functions**  
   Depois de alterar os secrets, faça redeploy das funções que usam Asaas para carregarem as novas variáveis:
   ```bash
   supabase functions deploy create_payment
   supabase functions deploy create_subscription
   supabase functions deploy asaas_webhook
   supabase functions deploy admin-manage
   supabase functions deploy validate-cpf-signup
   ```

6. **Clientes e assinaturas**  
   Clientes/assinaturas criados no **sandbox** não existem na API de produção. Usuários que se cadastraram no sandbox terão de passar de novo pela validação de CPF/CNPJ e assinatura em produção (ou você migra manualmente no Asaas se precisar).

Resumo: **`ASAAS_ENV=production`** + **`ASAAS_API_KEY`** da conta produção + webhook em produção + redeploy das funções.

---

## Links úteis

- [Documentação Asaas – Chaves de API](https://docs.asaas.com/docs/chaves-de-api)
- [Sandbox Asaas](https://sandbox.asaas.com) (criar conta de testes)
