-- Bloqueio de usuário (com motivo) + bloqueio de aparelho (impede novas contas).
alter table public.profiles
  add column if not exists blocked_reason text,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid;

create table if not exists public.blocked_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  reason text,
  source_user_id uuid,
  blocked_by uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists blocked_devices_active_uidx on public.blocked_devices(device_id) where active;
alter table public.blocked_devices enable row level security;
drop policy if exists "admins manage blocked_devices" on public.blocked_devices;
create policy "admins manage blocked_devices" on public.blocked_devices
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create or replace function public.is_device_blocked(p_device_id text)
returns boolean language sql security definer set search_path = public as $fn$
  select exists(select 1 from public.blocked_devices where device_id = p_device_id and active);
$fn$;
grant execute on function public.is_device_blocked(text) to anon, authenticated;

create or replace function public.admin_block_user(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  update public.profiles set is_blocked=true, blocked_reason=p_reason, blocked_at=now(), blocked_by=auth.uid() where user_id=p_user_id;
end; $fn$;

create or replace function public.admin_unblock_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  update public.profiles set is_blocked=false, blocked_reason=null, blocked_at=null, blocked_by=null where user_id=p_user_id;
end; $fn$;

create or replace function public.admin_block_device(p_user_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_count int;
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  insert into public.blocked_devices (device_id, reason, source_user_id, blocked_by)
  select d.device_id, p_reason, p_user_id, auth.uid()
  from public.user_devices d
  where d.user_id = p_user_id and d.device_id is not null
    and not exists (select 1 from public.blocked_devices b where b.device_id = d.device_id and b.active);
  get diagnostics v_count = row_count;
  return v_count;
end; $fn$;

create or replace function public.admin_unblock_device(p_device_id text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin'; end if;
  update public.blocked_devices set active=false where device_id=p_device_id;
end; $fn$;
