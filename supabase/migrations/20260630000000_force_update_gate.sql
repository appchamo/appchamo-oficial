-- Atualização obrigatória (force update gate): configura via platform_settings.
-- update_gate_enabled: liga/desliga a checagem.
-- update_min_version: versão mínima exigida (ex: "2.3"). Abaixo dela, o app nativo bloqueia.
-- update_android_url / update_ios_url: links das lojas.

insert into public.platform_settings (key, value) values
  ('update_gate_enabled', 'true'::jsonb),
  ('update_min_version', '"0"'::jsonb),
  ('update_android_url', '"https://play.google.com/store/apps/details?id=com.chamo.app"'::jsonb),
  ('update_ios_url', '""'::jsonb)
on conflict (key) do nothing;

-- Leitura pública (anon + authenticated) das chaves update_*, igual ao region gate.
drop policy if exists "Anyone can view update gate settings" on public.platform_settings;
create policy "Anyone can view update gate settings"
on public.platform_settings for select
to anon, authenticated
using (key like 'update\_%');
