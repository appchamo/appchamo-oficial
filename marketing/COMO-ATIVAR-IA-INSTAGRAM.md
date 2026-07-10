# Social media de IA no Instagram do Chamô

A IA responde **direct (DM)** e **comentários** automaticamente. O backend já está pronto e no ar
(edge function `instagram-webhook` + tabela de log `ig_interactions`). Falta a configuração do
lado do Meta e alguns segredos — isso só você consegue fazer, porque envolve login e tokens.

**URL do webhook (você vai colar no Meta):**
`https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/instagram-webhook`

**App que vamos usar (já existe, é seu):** `WIZ MIDIA - CLAUDE` — App ID `1575920977424419`.
**Página do Chamô:** id `824446207428224` · **Instagram:** @appchamo (id `17841477705977355`).

> Boa notícia: esse app **já tem as permissões** `instagram_manage_messages` e `instagram_manage_comments`
> concedidas, e já enxerga a Página do Chamô. Então NÃO precisa criar app novo nem passar de novo pela
> App Review dessas permissões. Só falta plugar o webhook e os segredos.

---

## Pré-requisitos (já atendidos)
- Instagram do Chamô é conta Comercial ligada à Página "Chamô" ✅ (confirmado).
- App com as permissões de mensagem/comentário ✅ (confirmado no app WIZ MIDIA - CLAUDE).
- Falta: créditos na **Anthropic** (console.anthropic.com → Plans & Billing). Sem crédito a IA não responde.
- Confirme que essas permissões estão em **Acesso Avançado** (App Review → Permissões e Recursos). Se
  estiverem só em "Acesso Padrão", a IA responde só a quem tem papel no app até liberar o avançado.

## Passo 1 — Pegar o token da Página (longa duração)
1. **Graph API Explorer** → escolhe o app **WIZ MIDIA - CLAUDE**.
2. Gera um **User Token** com as permissões `instagram_manage_messages`, `instagram_manage_comments`, `pages_read_engagement`, `instagram_basic`.
3. Em "Get Token" pega o **Page Access Token da Página Chamô** (id `824446207428224`).
4. Troca por **token de longa duração** (long-lived). Esse valor vira o segredo `IG_PAGE_TOKEN`.

## Passo 2 — Definir os segredos no Supabase
No painel do Supabase → **Project Settings → Edge Functions → Secrets**, adiciona:

| Nome | Valor |
|------|-------|
| `IG_VERIFY_TOKEN` | uma senha que **você inventa** (ex.: `chamo-ig-2026`). Vai repetir no Meta. |
| `IG_APP_SECRET` | o **App Secret** do app WIZ MIDIA - CLAUDE (Configurações → Básico). Valida a assinatura. |
| `IG_PAGE_TOKEN` | o token de longa duração do Passo 1. |
| `ANTHROPIC_API_KEY` | já existe (só garanta que tem crédito). |

(Opcional: `IG_GRAPH_VERSION`, padrão `v21.0`.)
> Você define esses segredos você mesmo. Nunca precisa me passar nenhum token.

## Passo 3 — Configurar o Webhook no Meta
1. No app WIZ MIDIA - CLAUDE, vai em **Instagram → Webhooks** (ou Produtos → Webhooks).
2. **Callback URL:** cola a URL do webhook (lá em cima).
3. **Verify token:** o mesmo texto que você pôs em `IG_VERIFY_TOKEN`.
4. Clica em **Verificar e salvar** (o Meta chama a URL e confirma).
5. **Assina os campos:** `messages` e `comments` (pode marcar `mentions` também).
6. Assina o app à conta: em **subscribed apps** da Página/Instagram (pela interface ou via Graph API).

## Passo 4 — Liberar mensagens no Instagram
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
