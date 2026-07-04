-- Fecha o limite de chamadas do plano FREE (antes era furado: só marcava o pro como
-- "unavailable", que o próprio pro podia desligar, e não bloqueava a chamada de fato).

-- 1) Função-base: o pro estourou o limite do plano?
--    Usa o plano MAIS generoso que o pro tem (corrige bug quando ele tem free + cortesia paga)
--    e soma bonus_calls. Plano ilimitado (max_calls = -1) nunca estoura.
create or replace function public.pro_over_free_limit(p_pro_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  pro_user_id uuid;
  bonus int;
  max_calls_allowed int;
  call_count int;
begin
  select user_id, coalesce(bonus_calls, 0) into pro_user_id, bonus
  from professionals where id = p_pro_id;
  if pro_user_id is null then return false; end if;

  -- pega o teto mais alto entre os planos do usuário (-1 = ilimitado vira "infinito")
  select mc into max_calls_allowed from (
    select case when p2.max_calls = -1 then 2147483647 else p2.max_calls end as mc
    from subscriptions s
    join plans p2 on p2.id = s.plan_id
    where s.user_id = pro_user_id
    order by mc desc
    limit 1
  ) t;

  if max_calls_allowed is null then
    select max_calls into max_calls_allowed from plans where id = 'free';
  end if;
  if max_calls_allowed is null or max_calls_allowed >= 2147483647 then
    return false; -- ilimitado
  end if;

  max_calls_allowed := max_calls_allowed + coalesce(bonus, 0);

  select count(*) into call_count
  from service_requests
  where professional_id = p_pro_id
    and (request_kind is distinct from 'following');

  return call_count >= max_calls_allowed;
end;
$$;

-- 2) BLOQUEIO REAL: rejeita a chamada nova quando o pro já está no limite.
create or replace function public.enforce_professional_call_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.request_kind is not distinct from 'following' then
    return NEW;
  end if;
  if public.pro_over_free_limit(NEW.professional_id) then
    raise exception 'Este profissional atingiu o limite de chamadas do plano gratuito e não está aceitando novas solicitações no momento.'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_call_limit_before_request on public.service_requests;
create trigger enforce_call_limit_before_request
  before insert on public.service_requests
  for each row execute function public.enforce_professional_call_limit();

-- 3) AFTER INSERT (existente): marca "unavailable" ao bater o limite. Agora usa a função-base
--    (corrige o bug de escolher plano errado quando há múltiplas assinaturas).
create or replace function public.check_professional_call_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.request_kind is not distinct from 'following' then
    return NEW;
  end if;
  if public.pro_over_free_limit(NEW.professional_id) then
    update professionals set availability_status = 'unavailable' where id = NEW.professional_id;
  end if;
  return NEW;
end;
$$;

-- 4) TRAVA: impede o pro de voltar pra "disponível" (ou busy/quotes_only) enquanto estiver estourado.
--    Assim o limite não pode mais ser burlado trocando o próprio status.
create or replace function public.guard_call_limit_availability()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.availability_status = 'unavailable' then
    return NEW;
  end if;
  if NEW.availability_status is not distinct from OLD.availability_status then
    return NEW;
  end if;
  if public.pro_over_free_limit(NEW.id) then
    NEW.availability_status := 'unavailable';
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_call_limit_availability_before_update on public.professionals;
create trigger guard_call_limit_availability_before_update
  before update of availability_status on public.professionals
  for each row execute function public.guard_call_limit_availability();

-- 5) Backfill: esconde agora quem já está estourado (os que estavam vazando).
update public.professionals p
set availability_status = 'unavailable'
where p.availability_status is distinct from 'unavailable'
  and public.pro_over_free_limit(p.id);
