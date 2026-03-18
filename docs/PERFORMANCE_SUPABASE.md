# Performance: onde olhar no Supabase (passo a passo simples)

## 1. O app está lento por causa do banco?

1. Acesse **[Supabase Dashboard](https://supabase.com/dashboard)** → seu projeto **ChamoBR**.
2. Menu **Reports** (ou **Observability** / **Database**) → **Database**:
   - Veja se há picos de **CPU** ou **conexões** no horário em que o app fica lento.
3. Se a CPU do Postgres fica **sempre alta** com poucos usuários → aí vale pensar em **Compute maior** (Settings → Compute and Disk).
4. Se a CPU está **baixa** e mesmo assim o app trava → o gargalo costuma ser **muitas requisições no celular** ou **código** (já otimizamos a lista de conversas com 1 função SQL em vez de dezenas de chamadas).

## 2. Consultas lentas (adivinhar menos, medir mais)

- **SQL Editor** → rode um `EXPLAIN ANALYZE` em queries que você suspeita (o time/dev pode colar a query).
- **Database → Indexes**: tabelas muito usadas (`chat_messages`, `service_requests`, `professionals`) precisam de índice em colunas de `WHERE` / `ORDER BY` / `JOIN`.

## 3. O que já foi feito no código (mar/2026)

| Área | Antes | Depois |
|------|--------|--------|
| **Conversas (Messages)** | Até **3 requisições HTTP por conversa** (última mensagem + não lidas) | **1 RPC** `get_chat_thread_summaries` + índice em `(request_id, created_at DESC)` |
| **Home (app nativo)** | Espera **~2,6 s** para montar patrocinadores/destaque | **~1,6 s** (menos espera artificial) |
| **Home** | Fiscal + layout competindo no 1º segundo | Checagem fiscal **atrasada 500 ms** |

**Importante:** aplique a migration `20260318140000_chat_thread_summaries_rpc.sql` (`supabase db push` ou SQL no painel). Sem ela, a lista de conversas volta ao modo antigo (mais lento).

## 4. Próximos ganhos (se ainda quiser mais)

- **Busca:** hoje carrega muitos profissionais de uma vez; no futuro: busca no servidor (texto + filtros) com limite/paginação.
- **Home:** juntar vários `select` em **uma** edge function ou RPC (menos round-trips no 4G).

## 5. Vercel

Plano mais caro no Vercel **não acelera** cada chamada ao Supabase. Ajuda mais em build, limites e edge — não é o primeiro lugar para “Home lenta”.
