-- Pós-serviço: pedir avaliação ao cliente após o serviço concluído.
alter table public.service_requests add column if not exists review_reminder_sent_at timestamptz;
comment on column public.service_requests.review_reminder_sent_at is 'Quando enviamos o lembrete de "avalie o profissional" ao cliente (evita repetir).';

do $$ begin perform cron.unschedule('post-service-review-reminder'); exception when others then null; end $$;
select cron.schedule('post-service-review-reminder', '0 */2 * * *', $cron$
  insert into public.notifications (user_id, title, message, type, link, metadata, read)
  select sr.client_id,
    'Como foi o serviço? ⭐',
    'Avalie o profissional e ajude outros clientes. Leva 10 segundos!',
    'info',
    '/messages/' || sr.id::text,
    jsonb_build_object('source','review_request','request_id', sr.id),
    false
  from public.service_requests sr
  join public.profiles pc on pc.user_id = sr.client_id
  where sr.status = 'completed'
    and sr.review_reminder_sent_at is null
    and sr.client_id is not null
    and pc.is_blocked = false
    and sr.updated_at > now() - interval '10 days'
    and not exists (select 1 from public.reviews r where r.request_id = sr.id and r.client_id = sr.client_id);

  update public.service_requests sr set review_reminder_sent_at = now()
  where sr.status = 'completed'
    and sr.review_reminder_sent_at is null
    and sr.client_id is not null
    and sr.updated_at > now() - interval '10 days'
    and not exists (select 1 from public.reviews r where r.request_id = sr.id and r.client_id = sr.client_id);
$cron$);
