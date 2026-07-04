-- Muda a estratégia do limite free: em vez de bloquear a chamada do cliente,
-- a chamada chega normal e o PROFISSIONAL é que fica travado pra responder (chat com cadeado).

-- 1) Remove o bloqueio na criação da chamada (cliente chama normal, sem erro).
drop trigger if exists enforce_call_limit_before_request on public.service_requests;

-- 2) Remove a trava de disponibilidade (o pro precisa continuar aparecendo/recebendo).
drop trigger if exists guard_call_limit_availability_before_update on public.professionals;

-- 3) AFTER INSERT: só carimba quando o pro estoura (pra sequência de avisos). Não some mais da busca.
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
    update professionals
    set call_limit_reached_at = coalesce(call_limit_reached_at, now())
    where id = NEW.professional_id;
  end if;
  return NEW;
end;
$$;

-- 4) Função que diz se ESTE chat está travado pro profissional
--    (chamada além da cota grátis + pro no plano free). Cliente nunca vê trava.
create or replace function public.service_request_locked_for_pro(p_request_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_pro uuid; v_created timestamptz; v_user uuid; v_bonus int; v_max int; v_rank int;
begin
  select professional_id, created_at into v_pro, v_created
  from service_requests where id = p_request_id;
  if v_pro is null then return false; end if;

  select user_id, coalesce(bonus_calls, 0) into v_user, v_bonus from professionals where id = v_pro;

  select mc into v_max from (
    select case when p2.max_calls = -1 then 2147483647 else p2.max_calls end as mc
    from subscriptions s join plans p2 on p2.id = s.plan_id
    where s.user_id = v_user
    order by mc desc limit 1
  ) t;
  if v_max is null then select max_calls into v_max from plans where id = 'free'; end if;
  if v_max is null or v_max >= 2147483647 then return false; end if;  -- ilimitado
  v_max := v_max + coalesce(v_bonus, 0);

  -- posição desta chamada na fila do pro (por data de criação)
  select count(*) into v_rank
  from service_requests
  where professional_id = v_pro
    and (request_kind is distinct from 'following')
    and created_at <= v_created;

  return v_rank > v_max;  -- além da cota grátis → travada
end;
$$;

grant execute on function public.service_request_locked_for_pro(uuid) to authenticated;

-- 5) Volta os pros que tinham sido escondidos: agora devem aparecer e receber chamadas.
update public.professionals
set availability_status = 'available'
where availability_status = 'unavailable'
  and public.pro_over_free_limit(id);

-- 6) Recarrega o cache do PostgREST pra achar a função nova.
notify pgrst, 'reload schema';
