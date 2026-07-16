-- Log de destinatários dos PEDIDOS abertos (broadcast): registra PARA QUEM cada pedido foi disparado.
-- Antes só existia a notificação criada na hora (sem vínculo com o pedido). Agora guardamos a lista.

create table if not exists public.open_request_recipients (
  id               uuid primary key default gen_random_uuid(),
  open_request_id  uuid not null references public.open_service_requests(id) on delete cascade,
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  user_id          uuid,
  created_at       timestamptz not null default now(),
  unique (open_request_id, professional_id)
);
create index if not exists idx_orr_request on public.open_request_recipients(open_request_id);
create index if not exists idx_orr_professional on public.open_request_recipients(professional_id);

alter table public.open_request_recipients enable row level security;
drop policy if exists "admin le orr" on public.open_request_recipients;
create policy "admin le orr" on public.open_request_recipients
  for select using (public.is_admin(auth.uid()));

-- Trigger de disparo: além de notificar, registra cada profissional que recebeu o pedido.
create or replace function public.trg_notify_professionals_on_open_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  -- 2) Notificação in-app (comportamento original, inalterado).
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

  return NEW;
end;
$$;

-- Backfill dos pedidos já existentes (snapshot best-effort com a base atual de profissionais).
insert into public.open_request_recipients (open_request_id, professional_id, user_id, created_at)
select r.id, p.id, pr.user_id, r.created_at
from public.open_service_requests r
join public.professionals p
  on (
    p.category_id = r.category_id
    or exists (select 1 from public.professions pf where pf.id = p.profession_id and pf.category_id = r.category_id)
  )
join public.profiles pr on pr.user_id = p.user_id
left join public.profile_private pp on pp.user_id = p.user_id
where p.active = true
  and p.profile_status = 'approved'
  and pr.user_id is distinct from r.client_id
  and length(trim(r.city)) > 0
  and length(trim(r.state)) > 0
  and upper(trim(coalesce(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), ''))) = upper(trim(r.state))
  and lower(trim(coalesce(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), ''))) = lower(trim(r.city))
on conflict (open_request_id, professional_id) do nothing;

comment on table public.open_request_recipients is 'Auditoria: para quais profissionais cada pedido aberto (open_service_requests) foi disparado.';
