-- Fecha o pedido escalado quando a chamada de origem é resolvida:
--  - aceita ou concluída  -> cliente está sendo atendido        -> fecha
--  - CANCELADA pelo próprio CLIENTE (auth.uid() = client_id)     -> cliente desistiu -> fecha
--  - cancelada/recusada pelo PROFISSIONAL                         -> cliente ainda precisa -> NÃO fecha
create or replace function public.trg_close_open_request_on_call_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _should_close boolean := false;
begin
  if NEW.status is distinct from OLD.status then
    if NEW.status in ('accepted','completed') then
      _should_close := true;
    elsif NEW.status = 'cancelled' and auth.uid() is not null and auth.uid() = NEW.client_id then
      _should_close := true; -- foi o próprio cliente que cancelou
    end if;

    if _should_close then
      update public.open_service_requests
        set status = 'closed', updated_at = now()
      where source_service_request_id = NEW.id and status = 'open';
    end if;
  end if;
  return NEW;
end;
$$;
