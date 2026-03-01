# Agenda exclusiva plano Business – Implementação

## Concluído

### Fase 1: Estrutura banco + backend
- **Migration** `supabase/migrations/20260228210000_agenda_business.sql`:
  - `professionals.agenda_enabled` (boolean)
  - `agenda_services` (id, professional_id, name, duration_minutes, active, created_at)
  - `agenda_availability_rules` (id, professional_id, weekday, start_time, end_time, slot_interval_minutes, capacity)
  - `agenda_availability_blocks` (id, professional_id, block_date, start_time, end_time, reason)
  - `agenda_appointments` (id, professional_id, client_id, service_id, appointment_date, start_time, end_time, status, chat_request_id, created_at, updated_at)
  - RLS e políticas para profissional/cliente
- **Tipos** em `src/integrations/supabase/types.ts`: profissionais.agenda_enabled + tabelas agenda_*.

### Fase 2: Tela empresa (configuração)
- **Menu lateral**: item "Agenda" (ícone Calendar) visível só para plano Business (`useSubscription().plan?.id === "business"`).
- **Rota** `/pro/agenda` → página `ProAgenda`.
- **ProAgenda**:
  - Se não for Business: mensagem + link para planos.
  - Toggle "Ativar agenda" (atualiza `professionals.agenda_enabled`).
  - CRUD **Serviços**: nome, duração (min).
  - CRUD **Horários semanais**: dia, início, fim, intervalo do slot, capacidade.
  - CRUD **Bloqueios**: data, início, fim, motivo.

### Fase 3: Fluxo cliente ✅
- No **perfil da empresa** (ProfessionalProfile): se `agenda_enabled` (empresa com agenda ativada), mostrar botão **"Agendar Serviço"**.
- Componente **AgendaBookingDialog**: Escolher serviço → Escolher data (calendário) → Escolher horário disponível (respeitando regras, bloqueios e capacidade) → Confirmar.
- Ao confirmar: cria `agenda_appointments` (pending), cria `service_requests`, vincula `chat_request_id`, mensagem de protocolo + mensagem de agendamento no chat, notificação para o profissional, navega para o chat.

### Fase 4: Integração chat ✅
- No **MessageThread**: ao carregar um chat com `agenda_appointments.chat_request_id = threadId`, se status = pending e usuário é profissional, mostra card **Novo agendamento** (serviço, data, horário) com botões **Aceitar** | **Recusar** | **Remarcar**.
- **Aceitar**: `agenda_appointments.status = confirmed`, `service_requests.status = accepted`, mensagem no chat, notificação ao cliente (com link).
- **Recusar**: `agenda_appointments.status = rejected`, `service_requests.status = cancelled`, mensagem no chat, notificação ao cliente.
- **Remarcar**: **AgendaRescheduleDialog** (data + horário disponível); ao confirmar, atualiza appointment (date, start_time, end_time), mensagem no chat, notificação ao cliente.
- Ao **Encerrar** a chamada (profissional), em todos os fluxos que setam `service_requests.status = completed`, também atualiza `agenda_appointments.status = done` onde `chat_request_id = threadId`.

---

### Fase 5: Push e lembretes ✅
- **Notificações**: todos os eventos de agenda já inserem em `notifications` (novo agendamento, confirmação, recusa, remarcação, cancelamento pelo cliente). Cancelamento pelo cliente também atualiza `agenda_appointments.status = 'canceled'` e notifica o profissional.
- **Push**: se no Supabase existir webhook na tabela `notifications` chamando a função `send-push-notification`, os inserts disparam push automaticamente.
- **Lembretes 24h e 1h antes**:
  - **Migration** `20260228220000_agenda_reminder_log.sql`: tabela `agenda_reminder_log` (appointment_id, reminder_type '24h'|'1h', sent_at) para evitar duplicatas.
  - **Edge Function** `agenda-reminders`: considera horário do agendamento em Brasil (UTC-3); janela 24h = [now+23h30, now+24h30], 1h = [now+50min, now+70min]; insere notificação para cliente e profissional e registra em `agenda_reminder_log`.
  - **Cron**: configurar no Supabase Dashboard (Edge Functions > agenda-reminders > Cron) para rodar a cada 15–30 min. Definir secret `CRON_SECRET` e enviar `Authorization: Bearer <CRON_SECRET>` na chamada. Opcional: definir `APP_URL` para links das notificações.

---

## Regras gerais (já consideradas no desenho)
- Apenas plano Business pode ativar agenda.
- Agenda opcional (toggle no menu / tela ProAgenda).
- Sem pagamento antecipado.
- Profissional confirma (aceitar/recusar/remarcar).
- Capacidade simultânea por horário (campo `capacity` em `agenda_availability_rules`).
- Agendamento cria `service_request` e chat; após confirmação o chat segue normal.
- Status do appointment pode ser atualizado para "done" manualmente (ex.: botão na tela do profissional ou no chat ao encerrar).
