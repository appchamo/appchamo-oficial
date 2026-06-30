-- Leitura pública do tema configurável da Home (cor de destaque etc.).
drop policy if exists "Anyone can view home theme" on public.platform_settings;
create policy "Anyone can view home theme" on public.platform_settings
  for select to anon, authenticated
  using (key = 'home_theme');
