-- Notificação diária automática escrita por IA (2x/dia) — RPC de broadcast + cron.

create or replace function public.broadcast_daily_ai_notification(
  p_secret text, p_title text, p_message text, p_link text, p_period text
) returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare _batch uuid := gen_random_uuid(); _count int; _expected text;
begin
  select value into _expected from private.app_config where key = 'email_hook_secret';
  if _expected is null or p_secret is distinct from _expected then
    raise exception 'unauthorized';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'titulo_vazio';
  end if;

  insert into public.notifications (user_id, title, message, type, link, metadata, batch_id, read)
  select p.user_id, p_title, p_message, 'info', coalesce(nullif(p_link, ''), '/home'),
         jsonb_build_object('source', 'daily_ai', 'period', coalesce(p_period, '')), _batch, false
  from (
    select distinct ud.user_id
    from public.user_devices ud
    join public.profiles pr on pr.user_id = ud.user_id
    where ud.push_token is not null
      and pr.is_blocked = false
      and pr.email not in ('admin@appchamo.com', 'suporte@appchamo.com')
  ) p;

  get diagnostics _count = row_count;
  return _count;
end;
$$;

revoke all on function public.broadcast_daily_ai_notification(text, text, text, text, text) from public;
grant execute on function public.broadcast_daily_ai_notification(text, text, text, text, text) to service_role;

-- Cron 2x/dia (horário de Brasília = UTC-3): 9h BRT = 12:00 UTC; 17h30 BRT = 20:30 UTC.
do $$ begin perform cron.unschedule('daily-ai-notification-morning'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('daily-ai-notification-afternoon'); exception when others then null; end $$;

select cron.schedule('daily-ai-notification-morning', '0 12 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/daily-ai-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select value from private.app_config where key = 'email_hook_secret')),
    body := jsonb_build_object('period', 'morning')
  );
$cron$);

select cron.schedule('daily-ai-notification-afternoon', '30 20 * * *', $cron$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/daily-ai-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select value from private.app_config where key = 'email_hook_secret')),
    body := jsonb_build_object('period', 'afternoon')
  );
$cron$);
