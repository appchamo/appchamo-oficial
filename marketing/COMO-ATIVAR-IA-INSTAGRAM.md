# Social media de IA no Instagram do Chamô

A IA responde **direct (DM)** e **comentários** automaticamente. O backend já está pronto e no ar
(edge function `instagram-webhook` + tabela de log `ig_interactions`). Falta a configuração do
lado do Meta e alguns segredos — isso só você consegue fazer, porque envolve login e tokens.

**URL do webhook (você vai colar no Meta):**
`https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/instagram-webhook`

---

## Pré-requisitos
- O Instagram do Chamô precisa ser conta **Comercial (Business) ou Criador**.
- Precisa estar **ligado a uma Página do Facebook**.
- Créditos na **Anthropic** (console.anthropic.com → Plans & Billing). Sem crédito, a IA não gera resposta.

## Passo 1 — Criar o app no Meta
1. Entra em **developers.facebook.com** → **Meus Apps** → **Criar app**.
2. Tipo: **Empresa (Business)**.
3. Dentro do app, adiciona o produto **Instagram** (API do Instagram com mensagens).

## Passo 2 — Permissões que o app precisa
- `instagram_manage_messages` (responder direct)
- `instagram_manage_comments` (responder comentários)
- `instagram_basic`, `pages_read_engagement`, `pages_manage_metadata`
> Pra funcionar com o público geral (não só contas de teste), o Meta exige **Revisão do App (App Review)**
> dessas permissões. Eles pedem um vídeo curto mostrando o uso. Leva alguns dias. Antes disso,
> funciona só nas contas com papel no app (admin/testador) — dá pra você testar com a sua conta.

## Passo 3 — Pegar o token da Página (longa duração)
1. No **Graph API Explorer**, seleciona o app, gera um token com as permissões acima.
2. Troca por um **token de longa duração** (long-lived page token).
3. Guarda esse token — ele vai virar o segredo `IG_PAGE_TOKEN`.

## Passo 4 — Definir os segredos no Supabase
No painel do Supabase → **Project Settings → Edge Functions → Secrets**, adiciona:

| Nome | Valor |
|------|-------|
| `IG_VERIFY_TOKEN` | uma senha que **você inventa** (ex.: `chamo-ig-2026`). Vai repetir no Meta. |
| `IG_APP_SECRET` | o **App Secret** do app (Configurações → Básico). Valida a assinatura dos eventos. |
| `IG_PAGE_TOKEN` | o token de longa duração do Passo 3. |
| `ANTHROPIC_API_KEY` | já existe (só garanta que tem crédito). |

(Opcional: `IG_GRAPH_VERSION`, padrão `v21.0`.)
> Você define esses segredos você mesmo. Nunca precisa me passar nenhum token.

## Passo 5 — Configurar o Webhook no Meta
1. No app, vai em **Instagram → Webhooks** (ou Produtos → Webhooks).
2. **Callback URL:** cola a URL do webhook (lá em cima).
3. **Verify token:** o mesmo texto que você pôs em `IG_VERIFY_TOKEN`.
4. Clica em **Verificar e salvar** (o Meta chama a URL e confirma).
5. **Assina os campos:** `messages` e `comments` (pode marcar `mentions` também).
6. Assina o app à conta: em **subscribed apps** da Página/Instagram (pela interface ou via Graph API).

## Passo 6 — Liberar mensagens no Instagram
No app do Instagram do Chamô → **Configurações → Privacidade das mensagens → Ferramentas conectadas**:
permita o acesso às mensagens pelo app conectado (senão o direct não chega no webhook).

---

## Como funciona depois de ligado
- Chegou um **direct** ou **comentário** → o Meta manda o evento pro webhook.
- A IA (Claude) lê, decide se responde ou ignora (spam/ofensa = ignora), e responde no tom do Chamô.
- Tudo fica registrado na tabela **`ig_interactions`** (o que chegou, o que a IA respondeu, status).

## Onde acompanhar o que a IA respondeu
No Supabase → SQL Editor:
```sql
select created_at, kind, from_username, incoming_text, reply_text, status
from public.ig_interactions
order by created_at desc limit 50;
```

## Regras de segurança já embutidas
- Não responde a si mesmo (evita loop).
- Não repete o mesmo evento (dedup).
- Ignora spam, ofensa e propaganda de terceiros.
- Reclamação/pagamento: pede desculpa e manda pro suporte, sem prometer reembolso/prazo.
- Sem travessão, tom humano (mesmo padrão do resto do Chamô).

## Ajustes fáceis (me pede quando quiser)
- Mudar o tom/persona da IA.
- Comentário virar direct (responde no comentário e puxa DM).
- Passar pra "rascunho pra aprovar" antes de responder.
- Estender pros perfis dos clientes da agência (cada um precisa da própria conexão no Meta).
