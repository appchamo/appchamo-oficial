-- Aviso + sequência de lembretes quando o pro free bate o limite de chamadas.
-- Controla o estágio da sequência (0=nada, 1=na hora, 2=24h, 3=3 dias, 4=7 dias).
alter table public.professionals add column if not exists call_limit_reached_at timestamptz;
alter table public.professionals add column if not exists call_limit_nudge_stage smallint not null default 0;

-- Carimba o momento em que estourou (na 1ª vez) junto com o "unavailable".
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
    set availability_status = 'unavailable',
        call_limit_reached_at = coalesce(call_limit_reached_at, now())
    where id = NEW.professional_id;
  end if;
  return NEW;
end;
$$;

-- Backfill: quem já está estourado começa a sequência a partir de agora.
update public.professionals
set call_limit_reached_at = now()
where call_limit_reached_at is null
  and public.pro_over_free_limit(id);
