-- Vincula o pedido aberto escalado à chamada de origem e o fecha quando a chamada é resolvida.
alter table public.open_service_requests
  add column if not exists source_service_request_id uuid references public.service_requests(id) on delete set null;
create index if not exists idx_osr_source_sr on public.open_service_requests(source_service_request_id);

create or replace function public.trg_close_open_request_on_call_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Chamada aceita ou concluída -> cliente já está sendo atendido -> encerra o pedido aberto que geramos.
  -- 'cancelled' NÃO fecha (o cliente ainda pode precisar; o broadcast segue ajudando).
  if NEW.status in ('accepted','completed') and NEW.status is distinct from OLD.status then
    update public.open_service_requests
      set status = 'closed', updated_at = now()
    where source_service_request_id = NEW.id and status = 'open';
  end if;
  return NEW;
end;
$$;

drop trigger if exists close_open_request_on_call_resolved on public.service_requests;
create trigger close_open_request_on_call_resolved
  after update on public.service_requests
  for each row execute function public.trg_close_open_request_on_call_resolved();
