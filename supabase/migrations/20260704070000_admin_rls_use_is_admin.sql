-- Troca RLS de admin que estava com email hardcoded (admin@ / suporte@) por is_admin(auth.uid()),
-- para os novos admins sócios (rafael@, breno@, bruno@, jovino@, felipe@) também terem acesso.
-- Afetava: aba WhatsApp do CRM (wa_messages/wa_inbound), analytics (app_events) e destinatários de notificação.

drop policy if exists "wa_messages_admin_select" on public.wa_messages;
create policy "wa_messages_admin_select" on public.wa_messages
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "wa_inbound_admin_select" on public.wa_inbound;
create policy "wa_inbound_admin_select" on public.wa_inbound
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "app_events_admin_select" on public.app_events;
create policy "app_events_admin_select" on public.app_events
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "admin_notify_recipients_admin_all" on public.admin_notify_recipients;
create policy "admin_notify_recipients_admin_all" on public.admin_notify_recipients
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
