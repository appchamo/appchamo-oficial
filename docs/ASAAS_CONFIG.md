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
  - **`sandbox`** (padrão) – usa `sandbox.asaas.com` (testes).
  - **`production`** – usa `api.asaas.com` (cobranças reais).

Se não definir nada, o app usa **sandbox**. Para ir a produção, crie o secret **`ASAAS_ENV`** com valor **`production`** e use a chave de API de **produção**.

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

## 6. Validação de CPF no cadastro

A validação de CPF/CNPJ do **profissional** usa a mesma **ASAAS_API_KEY**: a Edge Function **validate-cpf-signup** chama `POST /customers` no Asaas. Se o Asaas aceitar (200), o documento é considerado válido e o `asaas_customer_id` é salvo no perfil. Não é preciso configurar nada extra no Asaas só para o CPF; basta a chave de API e o deploy da função (com CORS ajustado).

---

## Links úteis

- [Documentação Asaas – Chaves de API](https://docs.asaas.com/docs/chaves-de-api)
- [Sandbox Asaas](https://sandbox.asaas.com) (criar conta de testes)
