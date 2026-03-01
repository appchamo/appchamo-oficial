# Agenda: Atendentes, Calendário e Tela do Cliente

## Visão geral

- **Empresa**: ver agenda em estilo calendário (Google), gerenciar **atendentes** (foto, descrição), configurar **por atendente** serviços, dias e horários.
- **Cliente**: ao agendar, escolher **atendente**; na **home** ver "Você tem agendamento"; página **Meus agendamentos** para ver, remarcar, cancelar e abrir chat.

---

## Fase A – Schema (feito)

- Tabela **agenda_atendentes** (id, professional_id, name, photo_url, description, active, sort_order, created_at).
- Coluna **atendente_id** (nullable) em agenda_services, agenda_availability_rules, agenda_availability_blocks, agenda_appointments.
- Migration: `20260228230000_agenda_atendentes.sql`. Rodar no Supabase (SQL Editor) junto com as demais.

---

## Fase B – ProAgenda por atendente ✅

- **Lista de atendentes**: cards com foto, nome, descrição; adicionar, editar, excluir; upload de foto (ImageCropUpload).
- **Config por atendente**: seletor "Configurar serviços e horários para: [Atendimento geral] | [Atendente 1] | ...". Ao escolher um, carregar e salvar serviços, regras e bloqueios com esse **atendente_id** (ou null para "Atendimento geral"). Compatível com dados atuais (atendente_id null).

---

## Fase C – Minha agenda (calendário) ✅

- **Menu**: itens "Minha agenda" (calendário) e "Configurar agenda" para plano Business.
- **Página** `/pro/agenda/calendario`: visão mês com grade de dias; contagem de agendamentos por dia; ao clicar no dia, lista de agendamentos (horário, serviço, atendente, cliente) com botão para abrir o chat.

---

## Fase D – Cliente escolhe atendente ao agendar

- No fluxo de agendamento no perfil da empresa: **passo 0** = escolher atendente (cards com foto, nome, descrição). Em seguida: serviço (filtrado por atendente), data, horário. Slots e regras usam o atendente selecionado.

---

## Fase E – Cliente: banner na home + Meus agendamentos

- **Home**: se o cliente tem agendamento (pending/confirmed) futuro, mostrar banner "Você tem agendamento, confira" com link para **/meus-agendamentos**.
- **Página /meus-agendamentos**: lista de agendamentos do cliente (data, hora, serviço, empresa, atendente, status). Ações: abrir chat, remarcar, cancelar. Ao clicar em um item, ir para o chat daquele agendamento.
