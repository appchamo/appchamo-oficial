-- Quando um pedido aberto sai de 'open' (vira 'filled' pelo "Conversar" ou 'closed' pelo auto-fechamento),
-- avisa os profissionais que demonstraram interesse — antes eles ficavam esperando sem saber que encerrou.
create or replace function public.trg_notify_interests_on_open_request_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status = 'open' and NEW.status in ('filled','closed') then
    insert into public.notifications (user_id, title, message, type, link, read)
    select distinct pr.user_id,
           'Pedido encerrado',
           'O cliente já encaminhou este pedido. Fique de olho nas próximas oportunidades. 👀',
           'open_request_closed',
           '/pro/pedidos-abertos',
           false
    from public.open_service_request_interests i
    join public.professionals p on p.id = i.professional_id
    join public.profiles pr on pr.user_id = p.user_id
    where i.open_request_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists notify_interests_on_open_request_closed on public.open_service_requests;
create trigger notify_interests_on_open_request_closed
  after update of status on public.open_service_requests
  for each row execute function public.trg_notify_interests_on_open_request_closed();
