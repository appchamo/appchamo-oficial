-- Ao criar um PEDIDO aberto, além de logar destinatários e notificar in-app,
-- aciona o dispatcher notify-open-request-wa que envia o template WhatsApp
-- "pedido_novo_regiao" para os profissionais (respeitando opt-out).
create or replace function public.trg_notify_professionals_on_open_request()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _secret text;
begin
  -- 1) Log de destinatários (auditoria: pra quem foi enviado).
  insert into public.open_request_recipients (open_request_id, professional_id, user_id)
  select NEW.id, p.id, pr.user_id
  from public.professionals p
  inner join public.profiles pr on pr.user_id = p.user_id
  left join public.profile_private pp on pp.user_id = p.user_id
  where
    (
      p.category_id = NEW.category_id
      or exists (
        select 1 from public.professions pf
        where pf.id = p.profession_id and pf.category_id = NEW.category_id
      )
    )
    and p.active = true
    and p.profile_status = 'approved'
    and pr.user_id is distinct from NEW.client_id
    and length(trim(NEW.city)) > 0
    and length(trim(NEW.state)) > 0
    and upper(trim(coalesce(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), ''))) = upper(trim(NEW.state))
    and length(trim(coalesce(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), ''))) > 0
    and lower(trim(coalesce(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), ''))) = lower(trim(NEW.city))
  on conflict (open_request_id, professional_id) do nothing;

  -- 2) Notificação in-app (comportamento original).
  insert into public.notifications (user_id, title, message, type, link, read)
  select
    pr.user_id,
    'Novo serviço disponível',
    left(trim(NEW.description), 500),
    'open_request_new',
    '/pro/pedidos-abertos',
    false
  from public.professionals p
  inner join public.profiles pr on pr.user_id = p.user_id
  left join public.profile_private pp on pp.user_id = p.user_id
  where
    (
      p.category_id = NEW.category_id
      or exists (
        select 1 from public.professions pf
        where pf.id = p.profession_id and pf.category_id = NEW.category_id
      )
    )
    and p.active = true
    and p.profile_status = 'approved'
    and pr.user_id is distinct from NEW.client_id
    and length(trim(NEW.city)) > 0
    and length(trim(NEW.state)) > 0
    and upper(trim(coalesce(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), ''))) = upper(trim(NEW.state))
    and length(trim(coalesce(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), ''))) > 0
    and lower(trim(coalesce(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), ''))) = lower(trim(NEW.city));

  -- 3) WhatsApp: aciona o dispatcher (envia o template pros destinatários, respeitando opt-out).
  select value into _secret from private.app_config where key = 'email_hook_secret';
  if _secret is not null then
    perform net.http_post(
      url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/notify-open-request-wa',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', _secret),
      body := jsonb_build_object('request_id', NEW.id)
    );
  end if;

  return NEW;
end;
$$;
