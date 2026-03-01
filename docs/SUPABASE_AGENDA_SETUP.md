# Configurar tabelas da Agenda no Supabase

Os erros **404** e **"Could not find the table 'public.agenda_services'"** aparecem porque as tabelas da agenda ainda **não existem** no seu projeto Supabase. É preciso rodar as migrations uma vez.

## Opção 1: Supabase SQL Editor (recomendado)

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard) e abra seu projeto.
2. No menu lateral, clique em **SQL Editor**.
3. Clique em **New query**.
4. Copie **todo** o conteúdo do arquivo **`supabase/migrations/20260228210000_agenda_business.sql`** (na pasta do projeto) e cole no editor.
5. Clique em **Run** (ou Ctrl/Cmd + Enter).
6. Confirme que a execução terminou sem erro (mensagem de sucesso em verde).
7. (Opcional) Se for usar lembretes 24h/1h, rode também o conteúdo de **`supabase/migrations/20260228220000_agenda_reminder_log.sql`** em uma nova query.
8. **Atendentes/especialistas**: rode o conteúdo de **`supabase/migrations/20260228230000_agenda_atendentes.sql`** para criar a tabela `agenda_atendentes` e as colunas `atendente_id` nas tabelas da agenda.

Depois disso, recarregue a página da agenda no app (`/pro/agenda`) e tente salvar o serviço e o horário de novo.

## Opção 2: Supabase CLI

Na pasta do projeto (onde está o arquivo `supabase/config.toml`), no terminal:

```bash
supabase db push
```

Isso aplica todas as migrations pendentes, incluindo as da agenda.

---

## O que essas migrations criam

- **professionals**: coluna `agenda_enabled` (ativa/desativa a agenda).
- **agenda_services**: serviços com nome e duração (ex.: Consultoria, 30 min).
- **agenda_availability_rules**: dias e horários de funcionamento (ex.: Segunda 09:00–18:00).
- **agenda_availability_blocks**: bloqueios de data/hora.
- **agenda_appointments**: agendamentos (usado quando o cliente agenda).
- **agenda_reminder_log**: (opcional) log dos lembretes 24h/1h.

Sem rodar a migration **20260228210000_agenda_business.sql**, as tabelas `agenda_services` e `agenda_availability_rules` não existem e o app retorna 404 ao salvar.
